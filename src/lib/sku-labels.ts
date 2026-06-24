// Friendly display names for the raw Windows SKU identifiers found in a
// setting's `applicability.windowsSkus`. Unknown values fall through to raw.

export const SKU_LABELS: Record<string, string> = {
  windowsEnterprise: 'Enterprise',
  windowsProfessional: 'Professional',
  windowsEducation: 'Education',
  windowsMultiSession: 'Multi-Session (AVD)',
  iotEnterprise: 'IoT Enterprise',
  iotEnterpriseSEval: 'IoT Enterprise (S Eval)',
  windows11SE: 'Windows 11 SE',
  windowsCPC: 'Cloud PC',
  windowsCloudN: 'Cloud N',
  windowsHome: 'Home',
  holographicForBusiness: 'HoloLens (Business)',
  holoLens: 'HoloLens',
  surfaceHub: 'Surface Hub',
  unknown: 'Unknown',
};

export function skuLabel(sku: string): string {
  return SKU_LABELS[sku] ?? sku;
}
