import { DEFAULT_PROFILE_NAME, MAX_IMPORT_FILE_BYTES } from '../../core/constants';
import { describeUnsupportedUrl, parseSupportedOrigin } from '../../core/origin';
import { StorageRepository } from '../../core/storage';
import type {
  ActiveTabInfo,
  FormProfile,
  PopupActionContext,
  PopupActionDescriptor,
  RecordedField,
} from '../../core/types';
import { createFeatureRegistry } from '../../features';
import { parseImportJson } from '../../features/portability/serializer';
import { createBrowserAdapter } from '../../platform/browser';
import { renderFieldEditorList, showImportChoice, showInlineConfirm } from '../shared/components';
import { clearChildren, createEl, getRequiredEl } from '../shared/dom';

type StatusTone = 'info' | 'success' | 'warn' | 'error';

const VARIANT_CLASS: Record<PopupActionDescriptor['variant'], string> = {
  primary: 'btn btn-primary',
  accent: 'btn btn-accent',
  neutral: 'btn btn-neutral',
  danger: 'btn btn-danger',
};

async function initPopup(): Promise<void> {
  const browser = createBrowserAdapter();
  const storage = new StorageRepository(browser);

  const siteInfoEl = getRequiredEl<HTMLElement>('siteInfo');
  const openOptionsBtn = getRequiredEl<HTMLButtonElement>('openOptionsBtn');
  const profileBar = getRequiredEl<HTMLElement>('profileBar');
  const profileSelect = getRequiredEl<HTMLSelectElement>('profileSelect');
  const newProfileBtn = getRequiredEl<HTMLButtonElement>('newProfileBtn');
  const renameProfileBtn = getRequiredEl<HTMLButtonElement>('renameProfileBtn');
  const deleteProfileBtn = getRequiredEl<HTMLButtonElement>('deleteProfileBtn');
  const profileNameForm = getRequiredEl<HTMLFormElement>('profileNameForm');
  const profileNameInput = getRequiredEl<HTMLInputElement>('profileNameInput');
  const profileNameCancel = getRequiredEl<HTMLButtonElement>('profileNameCancel');
  const primarySlot = getRequiredEl<HTMLElement>('primaryActions');
  const secondarySlot = getRequiredEl<HTMLElement>('secondaryActions');
  const utilitySlot = getRequiredEl<HTMLElement>('utilityActions');
  const importFileInput = getRequiredEl<HTMLInputElement>('importFile');
  const confirmHost = getRequiredEl<HTMLElement>('confirmHost');
  const statusBar = getRequiredEl<HTMLElement>('statusBar');
  const fieldCountEl = getRequiredEl<HTMLElement>('fieldCount');
  const fieldListEl = getRequiredEl<HTMLElement>('fieldList');

  let activeTab: ActiveTabInfo | null = null;
  let currentOrigin: string | null = null;
  let activeProfile: FormProfile | null = null;
  let nameFormMode: 'create' | 'rename' | null = null;

  const setStatus = (message: string, tone: StatusTone = 'info') => {
    statusBar.textContent = message;
    statusBar.dataset['tone'] = tone;
  };

  const registry = createFeatureRegistry({
    storage,
    onRequestPopupImport: () => importFileInput.click(),
  });

  const actionButtons = new Map<
    string,
    { descriptor: PopupActionDescriptor; btn: HTMLButtonElement }
  >();

  const buildContext = (): PopupActionContext => ({
    browser,
    activeTab,
    origin: currentOrigin,
    activeProfileId: activeProfile?.id ?? null,
    notify: setStatus,
    requestConfirm: (opts) => showInlineConfirm(confirmHost, opts),
    refresh,
  });

  function renderActionSlot(host: HTMLElement, actions: readonly PopupActionDescriptor[]): void {
    clearChildren(host);
    for (const action of actions) {
      const children: Array<Node | string> = [action.label];
      if (action.shortcutKey) {
        children.push(
          createEl('span', { className: 'kbd', text: action.shortcutKey.toUpperCase() })
        );
      }
      const btn = createEl(
        'button',
        {
          type: 'button',
          className: VARIANT_CLASS[action.variant],
          id: `action-${action.id}`,
          dataset: { actionId: action.id },
        },
        children
      );
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await action.execute(buildContext());
        } catch (err) {
          setStatus(err instanceof Error ? err.message : 'Action failed', 'error');
        } finally {
          updateActionDisabledStates();
        }
      });
      actionButtons.set(action.id, { descriptor: action, btn });
      host.append(btn);
    }
  }

  function updateActionDisabledStates(): void {
    for (const { descriptor, btn } of actionButtons.values()) {
      btn.disabled = Boolean(descriptor.requiresOrigin && !currentOrigin);
    }
  }

  function renderProfileControls(profiles: readonly FormProfile[], activeId: string | null): void {
    clearChildren(profileSelect);
    if (!currentOrigin) {
      profileBar.classList.add('hidden');
      return;
    }
    profileBar.classList.remove('hidden');

    if (profiles.length === 0) {
      profileSelect.append(
        createEl('option', { value: '', text: `${DEFAULT_PROFILE_NAME} (empty)` })
      );
      profileSelect.disabled = true;
      renameProfileBtn.disabled = true;
      deleteProfileBtn.classList.add('hidden');
      return;
    }

    profileSelect.disabled = false;
    renameProfileBtn.disabled = false;
    deleteProfileBtn.classList.toggle('hidden', profiles.length <= 1);

    for (const profile of profiles) {
      const opt = createEl('option', {
        value: profile.id,
        text: `${profile.name} (${profile.fields.length})`,
      });
      opt.selected = profile.id === activeId;
      profileSelect.append(opt);
    }
  }

  function renderFieldsForActiveProfile(): void {
    const fields = activeProfile?.fields ?? [];
    fieldCountEl.textContent = String(fields.length);

    if (!currentOrigin) {
      clearChildren(fieldListEl);
      fieldListEl.append(
        createEl('p', {
          className: 'empty-msg',
          text: describeUnsupportedUrl(activeTab?.url),
        })
      );
      return;
    }

    renderFieldEditorList(fieldListEl, fields, {
      onChange: async (index: number, updated: RecordedField) => {
        if (!currentOrigin || !activeProfile) return;
        const nextFields = [...activeProfile.fields];
        nextFields[index] = updated;
        activeProfile = await storage.saveProfileFields(
          currentOrigin,
          nextFields,
          activeProfile.id
        );
        setStatus(`Updated "${updated.label}"`, 'success');
      },
      onDelete: async (index: number) => {
        if (!currentOrigin || !activeProfile) return;
        const removed = activeProfile.fields[index];
        const nextFields = activeProfile.fields.filter((_, i) => i !== index);
        activeProfile = await storage.saveProfileFields(
          currentOrigin,
          nextFields,
          activeProfile.id
        );
        setStatus(
          removed ? `Removed "${removed.label}"` : `${nextFields.length} field(s) remaining`,
          'info'
        );
        await refresh(false);
      },
    });
  }

  async function refresh(updateStatus = true): Promise<void> {
    activeTab = await browser.getActiveTab();
    currentOrigin = parseSupportedOrigin(activeTab?.url);
    siteInfoEl.textContent = currentOrigin ?? 'Unsupported page';
    siteInfoEl.title = activeTab?.url ?? 'No active tab';

    if (!currentOrigin) {
      activeProfile = null;
      renderProfileControls([], null);
      renderFieldsForActiveProfile();
      updateActionDisabledStates();
      if (updateStatus) {
        setStatus(describeUnsupportedUrl(activeTab?.url), 'warn');
      }
      return;
    }

    const site = await storage.getSite(currentOrigin);
    const profiles = site?.profiles ?? [];
    activeProfile = profiles.find((p) => p.id === site?.activeProfileId) ?? profiles[0] ?? null;

    renderProfileControls(profiles, activeProfile?.id ?? null);
    renderFieldsForActiveProfile();
    updateActionDisabledStates();

    if (updateStatus) {
      const count = activeProfile?.fields.length ?? 0;
      setStatus(
        count > 0
          ? `${count} field(s) saved in "${activeProfile?.name ?? DEFAULT_PROFILE_NAME}"`
          : 'No fields saved yet — click Record',
        'info'
      );
    }
  }

  // Render feature-registered actions into slots
  renderActionSlot(primarySlot, registry.getPopupActions('primary'));
  renderActionSlot(secondarySlot, registry.getPopupActions('secondary'));
  renderActionSlot(utilitySlot, registry.getPopupActions('utility'));

  // Profile selector and inline create/rename/delete
  openOptionsBtn.addEventListener('click', () => {
    void browser.openOptionsPage();
  });

  profileSelect.addEventListener('change', async () => {
    if (!currentOrigin || !profileSelect.value) return;
    await storage.setActiveProfile(currentOrigin, profileSelect.value);
    await refresh();
  });

  const openNameForm = (mode: 'create' | 'rename', initialValue: string) => {
    nameFormMode = mode;
    profileNameInput.value = initialValue;
    profileNameForm.classList.remove('hidden');
    profileNameInput.focus();
    profileNameInput.select();
  };

  const closeNameForm = () => {
    nameFormMode = null;
    profileNameForm.classList.add('hidden');
  };

  newProfileBtn.addEventListener('click', () => {
    if (!currentOrigin) return;
    openNameForm('create', '');
  });

  renameProfileBtn.addEventListener('click', () => {
    if (!currentOrigin || !activeProfile) return;
    openNameForm('rename', activeProfile.name);
  });

  profileNameCancel.addEventListener('click', closeNameForm);

  profileNameForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!currentOrigin || !nameFormMode) return;
    const rawName = profileNameInput.value.trim();
    if (!rawName) return;

    try {
      if (nameFormMode === 'create') {
        const created = await storage.createProfile(currentOrigin, rawName);
        setStatus(`Created profile "${created.name}"`, 'success');
      } else if (activeProfile) {
        await storage.renameProfile(currentOrigin, activeProfile.id, rawName);
        setStatus(`Renamed profile to "${rawName}"`, 'success');
      }
      closeNameForm();
      await refresh(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Profile update failed', 'error');
    }
  });

  deleteProfileBtn.addEventListener('click', async () => {
    if (!currentOrigin || !activeProfile) return;
    const ok = await showInlineConfirm(confirmHost, {
      message: `Delete profile "${activeProfile.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await storage.deleteProfile(currentOrigin, activeProfile.id);
    setStatus('Profile deleted', 'info');
    await refresh(false);
  });

  // Popup file import (Chromium; Firefox redirects to options.html#import)
  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    importFileInput.value = '';
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
      await refresh(false);
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : 'Invalid file'}`, 'error');
    }
  });

  // Single-key shortcuts (R / F) when focus is not inside an editable input
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      return;
    }
    const key = ev.key.toLowerCase();
    for (const { descriptor, btn } of actionButtons.values()) {
      if (descriptor.shortcutKey === key && !btn.disabled) {
        ev.preventDefault();
        btn.click();
        break;
      }
    }
  });

  await refresh();
}

document.addEventListener('DOMContentLoaded', () => {
  void initPopup();
});
