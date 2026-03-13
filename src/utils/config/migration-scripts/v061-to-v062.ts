/**
 * Migration script from v061 to v062
 * - Adds glossary configuration
 */
export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    glossary: {
      entries: [],
    },
  }
}
