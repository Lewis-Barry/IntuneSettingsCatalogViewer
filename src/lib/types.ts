// ─── Microsoft Graph API Types for Intune Settings Catalog ───

/** Platforms supported by Intune */
export type Platform =
  | 'none'
  | 'android'
  | 'iOS'
  | 'macOS'
  | 'windows10X'
  | 'windows10'
  | 'linux'
  | 'androidEnterprise'
  | 'aosp'
  | 'visionOS'
  | 'tvOS';

/** Deployment technologies */
export type Technology =
  | 'none'
  | 'mdm'
  | 'windows10XManagement'
  | 'configManager'
  | 'appleRemoteManagement'
  | 'microsoftSense'
  | 'exchangeOnline'
  | 'mobileApplicationManagement'
  | 'linuxMdm'
  | 'extensibility'
  | 'enrollment'
  | 'endpointPrivilegeManagement'
  | 'windowsOsRecovery'
  | 'android';

/** Setting usage types */
export type SettingUsage = 'none' | 'configuration' | 'compliance' | 'inventory';

/** Visibility contexts */
export type Visibility = 'none' | 'settingsCatalog' | 'template' | 'inventoryCatalog';

/** UX behavior hints */
export type UxBehavior =
  | 'default'
  | 'dropdown'
  | 'smallTextBox'
  | 'largeTextBox'
  | 'toggle'
  | 'multiheaderGrid'
  | 'contextPane';

/** OData discriminator types for setting definitions */
export type SettingDefinitionODataType =
  | '#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition'
  | '#microsoft.graph.deviceManagementConfigurationSimpleSettingDefinition'
  | '#microsoft.graph.deviceManagementConfigurationSettingGroupDefinition'
  | '#microsoft.graph.deviceManagementConfigurationSettingGroupCollectionDefinition'
  | '#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionDefinition'
  | '#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionDefinition'
  | '#microsoft.graph.deviceManagementConfigurationRedirectSettingDefinition';

// ─── Category ───

export interface SettingCategory {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  categoryDescription?: string;
  helpText?: string;
  platforms?: string;
  technologies?: string;
  settingUsage?: string;
  parentCategoryId: string;
  rootCategoryId?: string;
  childCategoryIds?: string[];
}

/** Category with computed children for tree rendering */
export interface CategoryTreeNode extends SettingCategory {
  children: CategoryTreeNode[];
  settingCount: number;
}

// ─── Applicability ───

export interface SettingApplicability {
  description?: string;
  platform?: Platform;
  deviceMode?: string;
  technologies?: string;
}

// ─── Setting Definition (base) ───

export interface SettingDefinition {
  '@odata.type': SettingDefinitionODataType;
  id: string;
  name: string;
  displayName: string;
  description?: string;
  helpText?: string;
  version?: string;
  categoryId: string;
  rootDefinitionId?: string;
  baseUri?: string;
  offsetUri?: string;
  settingUsage?: string;
  visibility?: string;
  uxBehavior?: UxBehavior;
  accessTypes?: string;
  applicability?: SettingApplicability;
  occurrence?: {
    minDeviceOccurrence: number;
    maxDeviceOccurrence: number;
  };
  keywords?: string[];
  infoUrls?: string[];
  referredSettingInformationList?: Array<{
    settingDefinitionId: string;
  }>;

  // ── Choice-specific ──
  options?: ChoiceOption[];
  defaultOptionId?: string;

  // ── Simple-specific ──
  valueDefinition?: ValueDefinition;
  defaultValue?: unknown;

  // ── Group-specific ──
  childIds?: string[];
  minimumCount?: number;
  maximumCount?: number;

  // ── Dependency ──
  dependentOn?: Array<{
    dependentOn: string;
    parentSettingId: string;
  }>;
  dependedOnBy?: Array<{
    dependedOnBy: string;
    required: boolean;
  }>;
}

export interface ChoiceOption {
  itemId: string;
  name?: string;
  displayName: string;
  description?: string;
  helpText?: string;
  dependentOn?: Array<{
    dependentOn: string;
    parentSettingId: string;
  }>;
  dependedOnBy?: Array<{
    dependedOnBy: string;
    required: boolean;
  }>;
}

export interface ValueDefinition {
  '@odata.type'?: string;
  minimumValue?: number;
  maximumValue?: number;
  isRequired?: boolean;
  minimumLength?: number;
  maximumLength?: number;
  format?: string;
}

// ─── Scope (derived from baseUri) ───

export type SettingScope = 'device' | 'user' | 'unknown';

// ─── Changelog ───

export interface ChangelogEntry {
  date: string; // ISO date
  added: ChangelogSettingRef[];
  removed: ChangelogSettingRef[];
  changed: ChangelogChange[];
}

export interface ChangelogSettingRef {
  id: string;
  displayName: string;
  categoryId: string;
  categoryName?: string;
}

export interface ChangelogChange {
  id: string;
  displayName: string;
  categoryId: string;
  categoryName?: string;
  fields: Array<{
    field: string;
    oldValue: string;
    newValue: string;
  }>;
}

// ─── Search Index Entry ───

export interface SearchIndexEntry {
  id: string;
  displayName: string;
  description: string;
  keywords: string;
  categoryId: string;
  categoryName: string;
  scope: SettingScope;
  platform: string;
  settingType: string;
}

// ─── Match Source (where a search query matched) ───

export type MatchSource = 'title' | 'description' | 'csp' | 'keywords' | 'category';

/** Detect which fields of a setting match the given search query.
 *  Returns an array of match sources (e.g. ['title', 'description']). */
export function detectMatchSources(
  setting: SettingDefinition,
  query: string,
  /** Optional extra keywords to match against (e.g. ASR rule GUIDs) */
  extraKeywords?: string[],
): MatchSource[] {
  if (!query || !query.trim()) return [];
  const terms = query.split(',').map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) return [];

  // Build a list of individual words + full phrases from the query
  const searchTokens: string[] = [];
  for (const term of terms) {
    searchTokens.push(term.toLowerCase());
    const words = term.split(/\s+/).filter(w => w.length > 0);
    for (const w of words) searchTokens.push(w.toLowerCase());
  }
  // Deduplicate
  const tokens = [...new Set(searchTokens)];

  const matches = (text: string | undefined): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return tokens.some(t => lower.includes(t));
  };

  const sources: MatchSource[] = [];
  if (matches(setting.displayName) || matches(setting.name)) sources.push('title');
  if (matches(setting.description)) sources.push('description');
  const cspPath = setting.baseUri && setting.offsetUri
    ? `${setting.baseUri}/${setting.offsetUri}`
    : setting.baseUri || setting.offsetUri || '';
  if (cspPath && matches(cspPath)) sources.push('csp');
  if (setting.keywords && setting.keywords.some(k => matches(k))) sources.push('keywords');
  if (!sources.includes('keywords') && extraKeywords && extraKeywords.some(k => matches(k))) sources.push('keywords');
  return sources;
}

// ─── Helpers ───

/** Derive scope from baseUri */
export function getSettingScope(baseUri?: string): SettingScope {
  if (!baseUri) return 'unknown';
  if (baseUri.toLowerCase().includes('/device/')) return 'device';
  if (baseUri.toLowerCase().includes('/user/')) return 'user';
  return 'unknown';
}

/** Get a human-friendly label for the setting type */
export function getSettingTypeLabel(odataType: string): string {
  const map: Record<string, string> = {
    '#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition': 'Choice',
    '#microsoft.graph.deviceManagementConfigurationSimpleSettingDefinition': 'Simple',
    '#microsoft.graph.deviceManagementConfigurationSettingGroupDefinition': 'Group',
    '#microsoft.graph.deviceManagementConfigurationSettingGroupCollectionDefinition': 'Group Coll.',
    '#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionDefinition': 'Choice Coll.',
    '#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionDefinition': 'Simple Coll.',
    '#microsoft.graph.deviceManagementConfigurationRedirectSettingDefinition': 'Redirect',
  };
  return map[odataType] || 'Unknown';
}

/** Get CSS color class for scope badge */
export function getScopeBadgeClass(scope: SettingScope): string {
  switch (scope) {
    case 'device': return 'bg-blue-100 text-blue-800';
    case 'user': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/** Get platform display label */
export function getPlatformLabel(platform?: string): string {
  const map: Record<string, string> = {
    windows10: 'Windows',
    macOS: 'macOS',
    iOS: 'iOS',
    android: 'Android',
    linux: 'Linux',
    androidEnterprise: 'Android Enterprise',
    aosp: 'AOSP',
    visionOS: 'visionOS',
    tvOS: 'tvOS',
  };
  return platform ? (map[platform] || platform) : 'Unknown';
}
