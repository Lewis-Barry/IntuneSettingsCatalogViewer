import { basePath } from './basePath';
import type { SettingDefinition } from './types';
import definitionFiles from '../../data/setting-definitions-manifest.json';

const requests = new Map<string, Promise<unknown>>();
const definitionMaps = new Map<string, Promise<Map<string, SettingDefinition>>>();

export function loadBrowserJson<T>(file: string): Promise<T> {
  const cached = requests.get(file);
  if (cached) return cached as Promise<T>;
  const request = fetch(`${basePath}/${file}`)
    .then((response) => {
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return response.json() as Promise<T>;
    })
    .catch((error) => {
      requests.delete(file);
      throw error;
    });
  requests.set(file, request);
  return request;
}

export function loadSettingDefinitions(scope: keyof typeof definitionFiles): Promise<Map<string, SettingDefinition>> {
  const file = definitionFiles[scope];
  const cached = definitionMaps.get(file);
  if (cached) return cached;
  const request = loadBrowserJson<SettingDefinition[]>(file)
    .then((settings) => new Map(settings.map((setting) => [setting.id, setting])))
    .catch((error) => {
      definitionMaps.delete(file);
      throw error;
    });
  definitionMaps.set(file, request);
  return request;
}