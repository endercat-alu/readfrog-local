export function migrate(oldConfig: any): any {
  const { betaExperience: _betaExperience, ...config } = oldConfig
  return config
}
