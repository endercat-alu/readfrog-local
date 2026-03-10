/**
 * Migration script from v060 to v061
 * - Adds AI Content Aware capture mode config
 */
export function migrate(oldConfig: any): any {
  const translateConfig = oldConfig.translate
  if (!translateConfig) {
    return oldConfig
  }

  return {
    ...oldConfig,
    translate: {
      ...translateConfig,
      aiContentAwareMode: "viewport",
    },
  }
}
