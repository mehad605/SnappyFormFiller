document.addEventListener('DOMContentLoaded', function () {
  const recordBtn = document.getElementById('recordBtn');
  const fillBtn = document.getElementById('fillBtn');
  const clearBtn = document.getElementById('clearBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const statusBar = document.getElementById('statusBar');
  const siteInfo = document.getElementById('siteInfo');
  const fieldList = document.getElementById('fieldList');

  // --- helpers ---

  let currentOrigin = null;
  let statusTimeout = null;

  function getTabOrigin(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      try {
        const url = new URL(tabs[0].url);
        cb(url.origin, tabs[0].id);
      } catch {
        cb(null, tabs[0]?.id);
      }
    });
  }

  function setStatus(msg, warn) {
    if (statusTimeout) clearTimeout(statusTimeout);
    statusBar.innerHTML = warn
      ? '<span class="warn">' + msg + '</span>'
      : '<span>' + msg + '</span>';
  }

  function loadSiteProfile(cb) {
    getTabOrigin(function (origin) {
      if (!origin) return cb(null);
      currentOrigin = origin;
      siteInfo.textContent = origin;
      chrome.storage.local.get(['profiles'], function (result) {
        const profiles = result.profiles || {};
        cb(profiles[origin] || []);
      });
    });
  }

  function saveSiteProfile(data, cb) {
    chrome.storage.local.get(['profiles'], function (result) {
      const profiles = result.profiles || {};
      if (data && data.length > 0) {
        profiles[currentOrigin] = data;
      } else {
        delete profiles[currentOrigin];
      }
      chrome.storage.local.set({ profiles }, cb || function () {});
    });
  }

  function fieldLabel(item) {
    return item.id || item.name || item.type || '?';
  }

  function renderFields(data) {
    fieldList.innerHTML = '';
    if (!data || data.length === 0) {
      fieldList.innerHTML = '<div class="empty-msg">No fields recorded for this site</div>';
      return;
    }
    data.forEach(function (item, idx) {
      const row = document.createElement('div');
      row.className = 'field-row';

      const label = document.createElement('div');
      label.className = 'field-label';
      label.title = item.id ? ('id: ' + item.id) : (item.name ? ('name: ' + item.name) : '');
      label.textContent = fieldLabel(item);

      const val = document.createElement('div');
      val.className = 'field-value';
      val.contentEditable = true;
      val.textContent = item.type === 'checkbox' || item.type === 'radio'
        ? (item.checked ? '✓ ' : '✗ ') + item.value
        : item.value;
      val.title = val.textContent;
      val.addEventListener('blur', function () {
        // ponytail: only text inputs get inline edit; checkboxes/radios need toggle
        if (item.type === 'checkbox' || item.type === 'radio') return;
        item.value = val.textContent;
        saveSiteProfile(data);
      });

      const type = document.createElement('div');
      type.className = 'field-type';
      type.textContent = item.type || 'text';

      const del = document.createElement('button');
      del.className = 'field-del';
      del.textContent = '×';
      del.addEventListener('click', function () {
        data.splice(idx, 1);
        saveSiteProfile(data);
        renderFields(data);
        setStatus(data.length ? data.length + ' fields' : 'Cleared');
      });

      row.appendChild(label);
      row.appendChild(val);
      row.appendChild(type);
      row.appendChild(del);
      fieldList.appendChild(row);
    });
  }

  function refresh() {
    loadSiteProfile(function (data) {
      if (data === null) {
        setStatus('Cannot read this page');
        fieldList.innerHTML = '';
        return;
      }
      setStatus(data.length ? data.length + ' fields saved' : 'No data');
      renderFields(data);
    });
  }

  // --- buttons ---

  recordBtn.addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript(
        { target: { tabId: tabs[0].id }, files: ['recorder.js'] },
        function (results) {
          if (!results || results.length === 0 || !results[0].result) {
            setStatus('No form fields found', true);
            return;
          }
          const formData = results[0].result;
          if (formData.length === 0) {
            setStatus('No form fields found', true);
            return;
          }
          getTabOrigin(function (origin) {
            if (!origin) { setStatus('Cannot read this page', true); return; }
            currentOrigin = origin;
            saveSiteProfile(formData, function () {
              setStatus(formData.length + ' fields recorded');
              renderFields(formData);
            });
          });
        }
      );
    });
  });

  fillBtn.addEventListener('click', function () {
    getTabOrigin(function (origin) {
      if (!origin) { setStatus('Cannot read this page', true); return; }
      currentOrigin = origin;
      chrome.storage.local.get(['profiles'], function (result) {
        const formData = (result.profiles || {})[origin];
        if (!formData || formData.length === 0) {
          setStatus('No data saved for this site', true);
          return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          chrome.scripting.executeScript(
            {
              target: { tabId: tabs[0].id },
              func: frameworkAwareFill,
              args: [formData]
            },
            function (results) {
              if (!results || results.length === 0) { setStatus('Fill failed', true); return; }
              const unmatched = results[0].result || [];
              if (unmatched.length > 0) {
                setStatus('Filled! (' + unmatched.length + ' unmatched)', true);
              } else {
                setStatus('Filled!');
              }
            }
          );
        });
      });
    });
  });

  clearBtn.addEventListener('click', function () {
    saveSiteProfile([], function () {
      setStatus('Cleared');
      renderFields([]);
    });
  });

  clearAllBtn.addEventListener('click', function () {
    if (!confirm('Delete all saved profiles?')) return;
    chrome.storage.local.remove(['profiles'], function () {
      setStatus('All data cleared');
      renderFields([]);
    });
  });

  // --- framework-aware fill function (runs in page context) ---

  function frameworkAwareFill(formData) {
    if (!formData || !Array.isArray(formData)) return [];
    const unmatched = [];
    // ponytail: cache native setters for React/Vue/Angular compatibility
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

    formData.forEach(function (item) {
      let el;
      if (item.id) el = document.getElementById(item.id);
      if (!el && item.name) {
        const query = '[name="' + CSS.escape(item.name) + '"]';
        const els = document.querySelectorAll(query);
        if (els.length > 0) {
          if (item.type === 'radio' || item.type === 'checkbox') {
            el = Array.from(els).find(function (e) { return e.value === item.value; });
          } else {
            el = els[0];
          }
        }
      }
      if (!el) { unmatched.push(fieldLabel(item)); return; }

      if (item.type === 'checkbox' || item.type === 'radio') {
        if (el.checked !== item.checked) {
          el.checked = item.checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        if (el.value !== item.value) {
          // Use native setter so React picks it up via its synthetic system
          if (el.tagName === 'INPUT' && inputSetter) {
            inputSetter.call(el, item.value);
          } else if (el.tagName === 'TEXTAREA' && textareaSetter) {
            textareaSetter.call(el, item.value);
          } else if (el.tagName === 'SELECT') {
            el.value = item.value;
          } else {
            el.value = item.value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }
    });

    return unmatched;
  }

  function fieldLabel(item) {
    return item.id || item.name || item.type || '?';
  }

  // --- init ---
  refresh();
});
