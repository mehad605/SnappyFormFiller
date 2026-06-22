(function() {
  const elements = document.querySelectorAll('input, select, textarea');
  const formData = [];

  elements.forEach(el => {
    if (['button', 'submit', 'reset', 'hidden', 'file', 'image'].includes(el.type)) return;
    if (el.id?.toLowerCase().includes('captcha') || el.name?.toLowerCase().includes('captcha')) return;

    const data = {
      id: el.id || null,
      name: el.name || null,
      type: el.type
    };

    if (el.type === 'checkbox' || el.type === 'radio') {
      data.checked = el.checked;
      data.value = el.value;
    } else {
      data.value = el.value;
    }

    formData.push(data);
  });

  return formData;
})();
