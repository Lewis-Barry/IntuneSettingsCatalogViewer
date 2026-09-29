import { z } from "zod";

/* all settings */

export type SettingInstance =
  | SimpleSettingInstance
  | SimpleSettingCollectionInstance
  | ChoiceSettingInstance
  | ChoiceSettingCollectionInstance
  | GroupSettingInstance
  | GroupSettingCollectionInstance;
export const SettingInstanceSchema: z.ZodType<SettingInstance> = z.lazy(() =>
  z.discriminatedUnion(
    "@odata.type",
    [
      SimpleSettingInstanceSchema,
      SimpleSettingCollectionInstanceSchema,
      ChoiceSettingInstanceSchema,
      ChoiceSettingCollectionInstanceSchema,
      GroupSettingInstanceSchema,
      GroupSettingCollectionInstanceSchema,
    ],
  )
);

export const SettingsDefinitionIdSchema = z.string().nonempty();
type SettingsDefinitionId = z.infer<typeof SettingsDefinitionIdSchema>;

/* Choice Settings */

export type ChoiceSettingValue = {
  "@odata.type"?:
    "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue";
  "value": string;
  "children": SettingInstance[];
};
export const ChoiceSettingValueSchema = z.object(
  {
    "@odata.type": z.literal(
      "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
    ).optional(),
    "value": z.string(),
    "children": z.array(SettingInstanceSchema),
  },
) satisfies z.ZodType<ChoiceSettingValue>;

export type ChoiceSettingInstance = {
  "@odata.type":
    "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance";
  "settingDefinitionId": SettingsDefinitionId;
  "choiceSettingValue": ChoiceSettingValue;
};
export const ChoiceSettingInstanceSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
  ),
  "settingDefinitionId": SettingsDefinitionIdSchema,
  "choiceSettingValue": ChoiceSettingValueSchema,
}) satisfies z.ZodType<ChoiceSettingInstance>;

export type ChoiceSettingCollectionInstance = {
  "@odata.type":
    "#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionInstance";
  "settingDefinitionId": SettingsDefinitionId;
  "choiceSettingCollectionValue": ChoiceSettingValue[];
};
export const ChoiceSettingCollectionInstanceSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionInstance",
  ),
  "settingDefinitionId": SettingsDefinitionIdSchema,
  "choiceSettingCollectionValue": z.array(ChoiceSettingValueSchema),
}) satisfies z.ZodType<ChoiceSettingCollectionInstance>;

/* Group Settings */

export type GroupSettingValue = {
  "@odata.type"?:
    "#microsoft.graph.deviceManagementConfigurationGroupSettingValue";
  "children": SettingInstance[];
};
export const GroupSettingValueSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationGroupSettingValue",
  ).optional(),
  "children": z.array(SettingInstanceSchema),
}) satisfies z.ZodType<GroupSettingValue>;

export type GroupSettingInstance = {
  "@odata.type":
    "#microsoft.graph.deviceManagementConfigurationGroupSettingInstance";
  "settingDefinitionId": SettingsDefinitionId;
  "groupSettingValue": GroupSettingValue;
};
export const GroupSettingInstanceSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationGroupSettingInstance",
  ),
  "settingDefinitionId": SettingsDefinitionIdSchema,
  "groupSettingValue": GroupSettingValueSchema,
}) satisfies z.ZodType<GroupSettingInstance>;

export type GroupSettingCollectionInstance = {
  "@odata.type":
    "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance";
  "settingDefinitionId": SettingsDefinitionId;
  "groupSettingCollectionValue": GroupSettingValue[];
};
export const GroupSettingCollectionInstanceSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
  ),
  "settingDefinitionId": SettingsDefinitionIdSchema,
  "groupSettingCollectionValue": z.array(GroupSettingValueSchema),
}) satisfies z.ZodType<GroupSettingCollectionInstance>;

/* Simple Settings */

export const IntegerSettingValueSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
  ),
  "value": z.int(),
});
export type IntegerSettingValue = z.infer<typeof IntegerSettingValueSchema>;

export const ReferenceSettingValueSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationReferenceSettingValue",
  ),
  "value": z.string(),
});
export type ReferenceSettingValue = z.infer<typeof ReferenceSettingValueSchema>;

export const SecretSettingValueSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
  ),
  "value": z.string(),
  "valueState": z.enum(["invalid", "notEncrypted", "encryptedValueToken"]),
});
export type SecretSettingValue = z.infer<typeof SecretSettingValueSchema>;

export const StringSettingValueSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
  ),
  "value": z.string(),
});
export type StringSettingValue = z.infer<typeof StringSettingValueSchema>;

export const SimpleSettingValueSchema = z.discriminatedUnion(
  "@odata.type",
  [
    IntegerSettingValueSchema,
    ReferenceSettingValueSchema,
    SecretSettingValueSchema,
    StringSettingValueSchema,
  ],
);
export type SimpleSettingValue = z.infer<typeof SimpleSettingValueSchema>;

export const SimpleSettingInstanceSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
  ),
  "settingDefinitionId": SettingsDefinitionIdSchema,
  "simpleSettingValue": SimpleSettingValueSchema,
});
export type SimpleSettingInstance = z.infer<typeof SimpleSettingInstanceSchema>;

export const SimpleSettingCollectionInstanceSchema = z.object({
  "@odata.type": z.literal(
    "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
  ),
  "settingDefinitionId": SettingsDefinitionIdSchema,
  "simpleSettingCollectionValue": z.array(SimpleSettingValueSchema),
});
export type SimpleSettingCollectionInstance = z.infer<
  typeof SimpleSettingCollectionInstanceSchema
>;

/* policy export */

export const ConfigurationPolicySchema = z.object({
  "@odata.context": z.literal(
    "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies/$entity",
  ),
  "id": z.guid(),
  "name": z.string().nonempty(),
  "lastModifiedDateTime": z.iso.datetime(),
  "templateReference": z.object({
    "templateId": z.string(),
    "templateFamily": z.string(),
    "templateDisplayName": z.string().nullable(),
    "templateDisplayVersion": z.string().nullable(),
  }).optional(),
  "settings": z.array(z.object({
    "settingInstance": SettingInstanceSchema,
  })),
});
export type ConfigurationPolicy = z.infer<typeof ConfigurationPolicySchema>;
