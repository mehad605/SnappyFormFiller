import { MAX_IMPORT_FILE_BYTES } from '../../core/constants';
import { StorageRepository } from '../../core/storage';
import type { ExtensionSettings, RecordedField } from '../../core/types';
import {
  createExportBundle,
  parseImportJson,
  triggerJsonDownload,
} from '../../features/portability/serializer';
import { createBrowserAdapter } from '../../platform/browser';
import { renderFieldEditorList, showImportChoice, showInlineConfirm } from '../shared/components';
import { clearChildren, createEl, getRequiredEl } from '../shared/dom';

type StatusTone = 'info' | 'success' | 'warn' | 'error';

async function initOptions(): Promise<void> {
  const browser = createBrowserAdapter();
  const storage = new StorageRepository(browser);

  const versionBadge = getRequiredEl<HTMLElement>('versionBadge');
  const statusBar = getRequiredEl<HTMLElement>('statusBar');
  const confirmHost = getRequiredEl<HTMLElement>('confirmHost');
  const exportBtn = getRequiredEl<HTMLButtonElement>('exportBtn');
  const importBtn = getRequiredEl<HTMLButtonElement>('importBtn');
  const clearAllBtn = getRequiredEl<HTMLButtonElement>('clearAllBtn');
  const importFile = getRequiredEl<HTMLInputElement>('importFile');
  const siteSearch = getRequiredEl<HTMLInputElement>('siteSearch');
  const sitesContainer = getRequiredEl<HTMLElement>('sitesContainer');

  const optSkipPasswords = getRequiredEl<HTMLInputElement>('optSkipPasswords');
  const optSkipSensitive = getRequiredEl<HTMLInputElement>('optSkipSensitive');
  const optHighlightFilled = getRequiredEl<HTMLInputElement>('optHighlightFilled');
  const optSkipEmpty = getRequiredEl<HTMLInputElement>('optSkipEmpty');

  versionBadge.textContent = `v${browser.getVersion()}`;

  const setStatus = (message: string, tone: StatusTone = 'info') => {
    statusBar.textContent = message;
    statusBar.dataset['tone'] = tone;
  };

  async function syncSettingsUi(): Promise<void> {
    const settings = await storage.getSettings();
    optSkipPasswords.checked = settings.skipPasswords;
    optSkipSensitive.checked = settings.skipSensitiveFields;
    optHighlightFilled.checked = settings.highlightFilled;
    optSkipEmpty.checked = settings.skipEmptyOnRecord;
  }

  const bindSetting = (input: HTMLInputElement, key: keyof ExtensionSettings) => {
    input.addEventListener('change', async () => {
      await storage.updateSettings({ [key]: input.checked });
      setStatus('Settings saved', 'success');
    });
  };

  bindSetting(optSkipPasswords, 'skipPasswords');
  bindSetting(optSkipSensitive, 'skipSensitiveFields');
  bindSetting(optHighlightFilled, 'highlightFilled');
  bindSetting(optSkipEmpty, 'skipEmptyOnRecord');

  async function renderSites(): Promise<void> {
    const root = await storage.load();
    const query = siteSearch.value.trim().toLowerCase();
    clearChildren(sitesContainer);

    const entries = Object.entries(root.sites)
      .filter(([origin, col]) => {
        if (!query) return true;
        if (origin.toLowerCase().includes(query)) return true;
        return col.profiles.some(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.fields.some((f) => f.label.toLowerCase().includes(query))
        );
      })
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      sitesContainer.append(
        createEl('p', {
          className: 'empty-msg',
          text: query
            ? `No sites match "${query}".`
            : 'No saved profiles yet. Open a page with a form and click Record in the popup.',
        })
      );
      return;
    }

    for (const [origin, collection] of entries) {
      const clearSiteBtn = createEl('button', {
        type: 'button',
        className: 'btn btn-danger btn-sm',
        text: 'Clear Site',
      });
      clearSiteBtn.addEventListener('click', async () => {
        const ok = await showInlineConfirm(confirmHost, {
          message: `Delete all profiles for ${origin}?`,
          confirmLabel: 'Clear Site',
          variant: 'danger',
        });
        if (!ok) return;
        await storage.clearSite(origin);
        setStatus(`Cleared ${origin}`, 'info');
        await renderSites();
      });

      const siteCard = createEl('article', { className: 'site-card' }, [
        createEl('div', { className: 'site-card-header' }, [
          createEl('span', { className: 'site-origin', text: origin }),
          clearSiteBtn,
        ]),
      ]);

      for (const profile of collection.profiles) {
        const delProfileBtn = createEl('button', {
          type: 'button',
          className: 'btn btn-neutral btn-sm',
          text: 'Delete Profile',
        });
        delProfileBtn.addEventListener('click', async () => {
          const ok = await showInlineConfirm(confirmHost, {
            message: `Delete profile "${profile.name}" on ${origin}?`,
            confirmLabel: 'Delete',
            variant: 'danger',
          });
          if (!ok) return;
          await storage.deleteProfile(origin, profile.id);
          setStatus(`Deleted "${profile.name}"`, 'info');
          await renderSites();
        });

        const fieldHost = createEl('div');
        renderFieldEditorList(fieldHost, profile.fields, {
          onChange: async (index: number, updated: RecordedField) => {
            const next = [...profile.fields];
            next[index] = updated;
            await storage.saveProfileFields(origin, next, profile.id);
            profile.fields = next;
            setStatus(`Updated "${updated.label}"`, 'success');
          },
          onDelete: async (index: number) => {
            const next = profile.fields.filter((_, i) => i !== index);
            await storage.saveProfileFields(origin, next, profile.id);
            setStatus('Field removed', 'info');
            await renderSites();
          },
        });

        siteCard.append(
          createEl('div', { className: 'profile-block' }, [
            createEl('div', { className: 'profile-block-header' }, [
              createEl('span', {
                className: 'profile-title',
                text: `${profile.name} (${profile.fields.length} field${profile.fields.length === 1 ? '' : 's'})`,
              }),
              delProfileBtn,
            ]),
            fieldHost,
          ])
        );
      }

      sitesContainer.append(siteCard);
    }
  }

  exportBtn.addEventListener('click', async () => {
    const root = await storage.load();
    const count = Object.keys(root.sites).length;
    if (count === 0) {
      setStatus('Nothing to export yet', 'warn');
      return;
    }
    triggerJsonDownload(createExportBundle(root));
    setStatus(`Exported ${count} site(s)`, 'success');
  });

  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setStatus('Import file exceeds 5 MB limit', 'error');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseImportJson(text);
      if (parsed.summary.siteCount === 0) {
        setStatus('Import file contained no valid sites', 'warn');
        return;
      }

      const choice = await showImportChoice(
        confirmHost,
        `Import ${parsed.summary.siteCount} site(s), ${parsed.summary.profileCount} profile(s), ${parsed.summary.fieldCount} field(s) (v${parsed.summary.sourceVersion} format)?`
      );
      if (choice === 'cancel') {
        setStatus('Import cancelled', 'info');
        return;
      }

      await storage.importSites(parsed.sites, choice);
      setStatus(
        `${choice === 'merge' ? 'Merged' : 'Replaced with'} ${parsed.summary.siteCount} site(s)`,
        'success'
      );
      await renderSites();
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : 'Invalid file'}`, 'error');
    }
  });

  clearAllBtn.addEventListener('click', async () => {
    const root = await storage.load();
    const count = Object.keys(root.sites).length;
    if (count === 0) {
      setStatus('No saved profiles to clear', 'info');
      return;
    }
    const ok = await showInlineConfirm(confirmHost, {
      message: `Delete all saved profiles across ${count} site(s)?`,
      confirmLabel: 'Delete All',
      variant: 'danger',
    });
    if (!ok) return;
    await storage.clearAll();
    setStatus('All profiles cleared', 'info');
    await renderSites();
  });

  siteSearch.addEventListener('input', () => {
    void renderSites();
  });

  await syncSettingsUi();
  await renderSites();

  if (globalThis.location.hash === '#import') {
    setStatus('Choose a JSON backup file to import.', 'info');
    importBtn.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void initOptions();
});
