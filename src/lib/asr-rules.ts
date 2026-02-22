/**
 * ASR (Attack Surface Reduction) rule GUID mapping.
 *
 * Maps each ASR rule's PascalCase name (as it appears in the Intune setting ID
 * after "attacksurfacereductionrules_") to its well-known GUID and metadata.
 *
 * Reference: https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference
 */

export interface AsrRuleInfo {
  /** Well-known GUID for this ASR rule */
  guid: string;
  /** Human-readable rule name (matches Microsoft docs) */
  ruleName: string;
  /** Additional notes / caveats */
  note?: string;
}

/**
 * Keyed by the lowercase PascalCase name fragment that appears in the Intune
 * setting ID after the "attacksurfacereductionrules_" prefix, e.g.
 *   "blockabuseofexploitedvulnerablesigneddrivers"
 */
const ASR_RULES: Record<string, AsrRuleInfo> = {
  blockabuseofexploitedvulnerablesigneddrivers: {
    guid: '56a863a9-875e-4185-98a7-b882c64b5ce5',
    ruleName: 'Block abuse of exploited vulnerable signed drivers',
  },
  blockadobereaderfromcreatingchildprocesses: {
    guid: '7674ba52-37eb-4a4f-a9a1-f0f9a1619a2c',
    ruleName: 'Block Adobe Reader from creating child processes',
  },
  blockallofficeapplicationsfromcreatingchildprocesses: {
    guid: 'd4f940ab-401b-4efc-aadc-ad5f3c50688a',
    ruleName: 'Block all Office applications from creating child processes',
  },
  blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem: {
    guid: '9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2',
    ruleName: 'Block credential stealing from the Windows local security authority subsystem (lsass.exe)',
  },
  blockexecutablecontentfromemailclientandwebmail: {
    guid: 'be9ba2d9-53ea-4cdc-84e5-9b1eeee46550',
    ruleName: 'Block executable content from email client and webmail',
  },
  blockexecutablefilesrunningunlesstheymeetprevalenceagetrustedlistcriterion: {
    guid: '01443614-cd74-433a-b99e-2ecdc07bfc25',
    ruleName: 'Block executable files from running unless they meet a prevalence, age, or trusted list criterion',
    note: 'File and folder exclusions not supported',
  },
  blockexecutionofpotentiallyobfuscatedscripts: {
    guid: '5beb7efe-fd9a-4556-801d-275e5ffc04cc',
    ruleName: 'Block execution of potentially obfuscated scripts',
  },
  blockjavascriptorvbscriptfromlaunchingdownloadedexecutablecontent: {
    guid: 'd3e037e1-3eb8-44c8-a917-57927947596d',
    ruleName: 'Block JavaScript or VBScript from launching downloaded executable content',
  },
  blockofficeapplicationsfromcreatingexecutablecontent: {
    guid: '3b576869-a4ec-4529-8536-b80a7769e899',
    ruleName: 'Block Office applications from creating executable content',
  },
  blockofficeapplicationsfrominjectingcodeintootherprocesses: {
    guid: '75668c1f-73b5-4cf0-bb93-3ecf5cb7cc84',
    ruleName: 'Block Office applications from injecting code into other processes',
  },
  blockofficecommunicationappfromcreatingchildprocesses: {
    guid: '26190899-1602-49e8-8b27-eb1d0a1ce869',
    ruleName: 'Block Office communication application from creating child processes',
  },
  blockpersistencethroughwmieventsubscription: {
    guid: 'e6db77e5-3df2-4cf1-b95a-636979351e5b',
    ruleName: 'Block persistence through WMI event subscription',
    note: 'File and folder exclusions not supported',
  },
  blockprocesscreationsfrompsexecandwmicommands: {
    guid: 'd1e49aac-8f56-4280-b9ba-993a6d77406c',
    ruleName: 'Block process creations originating from PSExec and WMI commands',
  },
  blockrebootingmachineinsafemode: {
    guid: '33ddedf1-c6e0-47cb-833e-de6133960387',
    ruleName: 'Block rebooting machine in Safe Mode',
  },
  blockuntrustedunsignedprocessesthatrunfromusb: {
    guid: 'b2b3f03d-6a65-4f7b-a9c7-1c7ef74a9ba4',
    ruleName: 'Block untrusted and unsigned processes that run from USB',
  },
  blockuseofcopiedorimpersonatedsystemtools: {
    guid: 'c0033c00-d16d-4114-a5a0-dc9b3a7d2ceb',
    ruleName: 'Block use of copied or impersonated system tools',
  },
  blockwebshellcreationforservers: {
    guid: 'a8f5898e-1dc8-49a9-9878-85004b8a61e6',
    ruleName: 'Block Webshell creation for Servers',
  },
  blockwin32apicallsfromofficemacros: {
    guid: '92e97fa1-2edf-4476-bdd6-9dd0b4dddc7b',
    ruleName: 'Block Win32 API calls from Office macros',
  },
  useadvancedprotectionagainstransomware: {
    guid: 'c1db55ab-c21a-4637-bb3f-a12568109d35',
    ruleName: 'Use advanced protection against ransomware',
  },
};

/** The prefix shared by all Defender ASR settings-catalog setting IDs */
const ASR_ID_PREFIX = 'device_vendor_msft_policy_config_defender_attacksurfacereductionrules_';

/**
 * Given an Intune setting ID, return ASR rule info if it maps to a known
 * ASR rule.  Works for both the main choice setting and its _perruleexclusions
 * child.
 *
 * Returns `undefined` for non-ASR settings.
 */
export function getAsrRuleInfo(settingId: string): AsrRuleInfo | undefined {
  if (!settingId.startsWith(ASR_ID_PREFIX)) return undefined;

  // Strip prefix, then strip known suffixes (_perruleexclusions, _off, _block, etc.)
  let fragment = settingId.slice(ASR_ID_PREFIX.length);
  // Remove per-rule exclusion suffix
  fragment = fragment.replace(/_perruleexclusions$/, '');
  // Remove option suffixes (_off, _block, _audit, _warn)
  fragment = fragment.replace(/_(off|block|audit|warn)$/, '');

  return ASR_RULES[fragment];
}

/**
 * Check whether a setting ID belongs to the Defender ASR rules family.
 */
export function isAsrSetting(settingId: string): boolean {
  return settingId.startsWith(ASR_ID_PREFIX) || settingId === ASR_ID_PREFIX.replace(/_$/, '');
}

/** Microsoft docs URL for the ASR rules reference page */
export const ASR_DOCS_URL =
  'https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference';
