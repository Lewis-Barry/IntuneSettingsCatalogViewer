import {
  type BaselineIndex,
  type BaselineSetting,
  type BaselineShard,
} from "./baseline-types";
import { loadBrowserJson, loadSettingDefinitions } from "./browser-data";
import {
  ConfigurationPolicySchema,
  type SettingInstance,
} from "./export-schemas";
import { type SettingDefinition } from "./types";

export const CUSTOM_BASELINE_PREFIX = "prefix:";

export class CustomBaselineError extends Error {}

async function loadJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CustomBaselineError("Policy file is not valid JSON.");
    }
    throw error;
  }
}

function buildChildren(
  lookup: {
    baselines: Map<string, SettingDefinition>;
    settings: Map<string, BaselineSetting>;
  },
  settings: SettingInstance[],
): { children?: BaselineSetting[] } {
  const children: BaselineSetting[] = settings.map((setting) => {
    const id = setting.settingDefinitionId;
    const definition = lookup.baselines.get(id);
    const baseline = lookup.settings.get(id);

    // the followin code must conform to fetch-baselines.ts
    const translateOption = (value: string): string => {
      const displayName = definition?.options?.find((option) =>
        option.itemId === value
      )
        ?.displayName;
      if (displayName) {
        return displayName;
      }
      const prefix = `${id}_`;
      return value.startsWith(prefix) ? value.substring(prefix.length) : value;
    };
    const description = definition?.description || definition?.helpText;
    const commonProps = {
      settingDefinitionId: id,
      displayName: (definition?.displayName || id).trim(),
      ...description ? { description } : {},
      ...baseline?.category ? { category: baseline.category } : {},
    };
    switch (setting["@odata.type"]) {
      case "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance":
        return {
          ...commonProps,
          value: setting.simpleSettingValue.value.toString(),
        };
      case "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance":
        return {
          ...commonProps,
          value: setting.simpleSettingCollectionValue.map((value) =>
            value.value
          ).join(", "),
        };
      case "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance":
        return {
          ...commonProps,
          optionId: setting.choiceSettingValue.value,
          value: translateOption(setting.choiceSettingValue.value),
          ...buildChildren(lookup, setting.choiceSettingValue.children),
        };
      case "#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionInstance":
        return {
          ...commonProps,
          optionIds: setting.choiceSettingCollectionValue.map((value) =>
            value.value
          ),
          value: setting.choiceSettingCollectionValue
            .map((value) => translateOption(value.value))
            .join(", "),
          ...buildChildren(
            lookup,
            setting.choiceSettingCollectionValue.flatMap((setting) =>
              setting.children
            ),
          ),
        };
      case "#microsoft.graph.deviceManagementConfigurationGroupSettingInstance":
        return {
          ...commonProps,
          ...buildChildren(lookup, setting.groupSettingValue.children),
        };
      case "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance":
        switch (setting.groupSettingCollectionValue.length) {
          case 0:
            return commonProps;
          case 1:
            return {
              ...commonProps,
              ...buildChildren(
                lookup,
                setting.groupSettingCollectionValue[0].children,
              ),
            };
          default:
            return {
              ...commonProps,
              children: setting.groupSettingCollectionValue.map((group, i) => {
                const mergeChildren = buildChildren(lookup, group.children);
                return {
                  settingDefinitionId: `${id}#${i}`,
                  displayName: mergeChildren.children?.find((m) =>
                    m.settingDefinitionId === `${id}_name`
                  )?.value || `Instance ${i + 1}`,
                  ...mergeChildren,
                };
              }),
            };
        }
    }
  });
  return children.length === 0 ? {} : { children };
}

export async function loadCustomBaseline(
  index: BaselineIndex,
  file: File,
): Promise<BaselineShard> {
  // load and parse the exported configuration
  const parseResult = ConfigurationPolicySchema.safeParse(await loadJson(file));
  if (!parseResult.success) {
    console.warn("policy syntax errors", parseResult.error.issues);
    throw new CustomBaselineError("Policy file is invalid.");
  }
  const policy = parseResult.data;

  // ensure the policy is based on a known baseline template
  const templateRef = policy.templateReference;
  if (!templateRef?.templateId) {
    throw new CustomBaselineError("Policy file is not based on a template.");
  }
  if (templateRef.templateFamily !== "baseline") {
    throw new CustomBaselineError(
      "Policy file is not based on a baseline template.",
    );
  }
  const templateId = templateRef.templateId.toLocaleLowerCase();
  if (
    !templateId.match(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_\d+$/)
  ) {
    console.error("policy template id", templateRef.templateId);
    throw new CustomBaselineError(
      "Policy file contains an invalid baseline template ID.",
    );
  }
  const baseId = templateId.split("_")[0].toLowerCase();
  const family = index.families.find((family) => family.baseId === baseId);
  if (!family) {
    throw new CustomBaselineError(
      `Policy file is based on ${
        templateRef.templateDisplayName ?? "unknown baseline"
      }.`,
    );
  }
  const version = family.versions.find((version) => version.id === templateId);
  if (!version) {
    throw new CustomBaselineError(
      `Policy file is based on ${
        templateRef.templateDisplayVersion ?? "unknown version"
      } of ${family.displayName}.`,
    );
  }

  // load the policy's baseline together with all baseline options
  const template = await loadBrowserJson<BaselineShard>(
    `baselines/${version.id}.json`,
  );
  const baselines = await loadSettingDefinitions("baselines");
  const settings = new Map(
    template.settings.map(
      (setting) => [setting.settingDefinitionId, setting],
    ),
  );

  // turn the exported config into a baseline itself
  const result = {
    id: `${CUSTOM_BASELINE_PREFIX}${policy.id}_${policy.lastModifiedDateTime}`,
    baseId,
    displayName: policy.name,
    displayVersion: policy.lastModifiedDateTime,
    lifecycleState: "custom",
    settings: buildChildren(
      { baselines, settings },
      policy.settings.map((settings) => settings.settingInstance),
    ).children ?? [],
  };
  return result;
}
