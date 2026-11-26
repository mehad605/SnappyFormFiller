import { DEFAULT_PROFILE_NAME } from '../../core/constants';
import type { StorageRepository } from '../../core/storage';
import type { FormProfile } from '../../core/types';
import { showInlineConfirm } from '../shared/components';
import { clearChildren, createEl, getRequiredEl } from '../shared/dom';

export interface ProfileBarCallbacks {
  getOrigin(): string | null;
  getActiveProfile(): FormProfile | null;
  notify(message: string, tone?: 'info' | 'success' | 'warn' | 'error'): void;
  refresh(updateStatus?: boolean): Promise<void>;
}

export interface ProfileBarController {
  render(origin: string | null, profiles: readonly FormProfile[], activeId: string | null): void;
}

/**
 * Encapsulates the popup's per-site profile selector and inline create/rename/delete controls.
 */
export function createProfileBarController(
  storage: StorageRepository,
  confirmHost: HTMLElement,
  callbacks: ProfileBarCallbacks
): ProfileBarController {
  const profileBar = getRequiredEl<HTMLElement>('profileBar');
  const profileSelect = getRequiredEl<HTMLSelectElement>('profileSelect');
  const newProfileBtn = getRequiredEl<HTMLButtonElement>('newProfileBtn');
  const renameProfileBtn = getRequiredEl<HTMLButtonElement>('renameProfileBtn');
  const deleteProfileBtn = getRequiredEl<HTMLButtonElement>('deleteProfileBtn');
  const profileNameForm = getRequiredEl<HTMLFormElement>('profileNameForm');
  const profileNameInput = getRequiredEl<HTMLInputElement>('profileNameInput');
  const profileNameCancel = getRequiredEl<HTMLButtonElement>('profileNameCancel');

  let nameFormMode: 'create' | 'rename' | null = null;

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

  profileSelect.addEventListener('change', async () => {
    const origin = callbacks.getOrigin();
    if (!origin || !profileSelect.value) return;
    await storage.setActiveProfile(origin, profileSelect.value);
    await callbacks.refresh();
  });

  newProfileBtn.addEventListener('click', () => {
    if (!callbacks.getOrigin()) return;
    openNameForm('create', '');
  });

  renameProfileBtn.addEventListener('click', () => {
    const profile = callbacks.getActiveProfile();
    if (!callbacks.getOrigin() || !profile) return;
    openNameForm('rename', profile.name);
  });

  profileNameCancel.addEventListener('click', closeNameForm);

  profileNameForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const origin = callbacks.getOrigin();
    if (!origin || !nameFormMode) return;
    const rawName = profileNameInput.value.trim();
    if (!rawName) return;

    try {
      if (nameFormMode === 'create') {
        const created = await storage.createProfile(origin, rawName);
        callbacks.notify(`Created profile "${created.name}"`, 'success');
      } else {
        const active = callbacks.getActiveProfile();
        if (active) {
          await storage.renameProfile(origin, active.id, rawName);
          callbacks.notify(`Renamed profile to "${rawName}"`, 'success');
        }
      }
      closeNameForm();
      await callbacks.refresh(false);
    } catch (err) {
      callbacks.notify(err instanceof Error ? err.message : 'Profile update failed', 'error');
    }
  });

  deleteProfileBtn.addEventListener('click', async () => {
    const origin = callbacks.getOrigin();
    const active = callbacks.getActiveProfile();
    if (!origin || !active) return;

    const ok = await showInlineConfirm(confirmHost, {
      message: `Delete profile "${active.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    await storage.deleteProfile(origin, active.id);
    callbacks.notify('Profile deleted', 'info');
    await callbacks.refresh(false);
  });

  return {
    render(origin, profiles, activeId) {
      clearChildren(profileSelect);
      if (!origin) {
        profileBar.classList.add('hidden');
        closeNameForm();
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
    },
  };
}
