import fs from 'fs';
import path from 'path';
import type { TemplateCatalogCategory, TemplateCatalogItem, TemplateManifest } from './types';

const TEMPLATE_DIR_SEGMENTS = ['..', '..', '..', 'assets', 'templates'];
const TEMPLATE_MANIFEST_DIR_SEGMENTS = ['..', '..', '..', 'assets', 'templates', 'manifests'];
const TEMPLATE_CATALOG_FILE_NAMES = ['catalog.json', 'official_catalog.json'];

function resolveAssetDirectories(): string[] {
    return [
        path.resolve(__dirname, ...TEMPLATE_DIR_SEGMENTS),
        path.resolve(process.cwd(), 'assets/templates'),
        path.resolve(process.cwd(), 'packages/server/assets/templates'),
        path.resolve(process.cwd(), 'dist/assets/templates'),
    ];
}

function resolveManifestDirectories(): string[] {
    return [
        path.resolve(__dirname, ...TEMPLATE_MANIFEST_DIR_SEGMENTS),
        path.resolve(process.cwd(), 'assets/templates/manifests'),
        path.resolve(process.cwd(), 'packages/server/assets/templates/manifests'),
        path.resolve(process.cwd(), 'dist/assets/templates/manifests'),
    ];
}

function readFirstExistingFile(candidates: string[]): Buffer {
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return fs.readFileSync(candidate);
        }
    }
    throw new Error(`Template asset not found. Tried: ${candidates.join(', ')}`);
}

export function getTemplateAssetPath(fileName: string): string {
    for (const candidateDir of resolveAssetDirectories()) {
        const candidate = path.join(candidateDir, fileName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(`Template file not found: ${fileName}`);
}

export function readTemplateAsset(fileName: string): Buffer {
    const candidates = resolveAssetDirectories().map((dir) => path.join(dir, fileName));
    return readFirstExistingFile(candidates);
}

export function readManifestAsset(fileName: string): TemplateManifest {
    const candidates = resolveManifestDirectories().map((dir) => path.join(dir, fileName));
    const buffer = readFirstExistingFile(candidates);
    return JSON.parse(buffer.toString('utf8')) as TemplateManifest;
}

function readCatalogAsset(): TemplateCatalogCategory[] {
    const candidateDirs = resolveAssetDirectories();
    const candidates = candidateDirs.flatMap((dir) => TEMPLATE_CATALOG_FILE_NAMES.map((file) => path.join(dir, file)));
    const buffer = readFirstExistingFile(candidates);
    return JSON.parse(buffer.toString('utf8')) as TemplateCatalogCategory[];
}

let templateCatalogCache: TemplateCatalogCategory[] | null = null;

export function loadTemplateCatalog(): TemplateCatalogCategory[] {
    if (!templateCatalogCache) {
        templateCatalogCache = readCatalogAsset();
    }
    return templateCatalogCache;
}

export function findTemplateCatalogItem(templateId: string): TemplateCatalogItem {
    const item = loadTemplateCatalog()
        .flatMap((category) => category.items)
        .find((template) => template.templateId === templateId);

    if (!item) {
        throw new Error(`Template id not found: ${templateId}`);
    }

    return item;
}

export function loadTemplateManifestById(templateId: string): TemplateManifest {
    const item = findTemplateCatalogItem(templateId);
    const manifest = readManifestAsset(item.manifestFile);
    if (manifest.templateId !== templateId) {
        throw new Error(`Template manifest mismatch for ${templateId}`);
    }
    return manifest;
}
