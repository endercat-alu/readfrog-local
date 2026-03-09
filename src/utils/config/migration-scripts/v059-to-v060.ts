/**
 * Migration script from v059 to v060
 * - Adds paragraph segmentation config for page translation
 */
export function migrate(oldConfig: any): any {
  const translatePage = oldConfig.translate?.page
  if (!translatePage) {
    return oldConfig
  }

  return {
    ...oldConfig,
    translate: {
      ...oldConfig.translate,
      page: {
        ...translatePage,
        paragraphSegmentation: {
          enabledRules: ["blankLine"],
          maxLinesPerParagraph: 2,
        },
      },
    },
  }
}
