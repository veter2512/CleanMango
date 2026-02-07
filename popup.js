// Пресеты
const PRESETS = {
  soft: {
    name: 'Чистая игра',
    voiceGain: -30,  // Изменено на -40 дБ
    gameGain: 3,
    bassGain: 2,
    clarityGain: 4,
    muteMid: false,
    spectralGate: 0,
    adaptiveMode: false,
    reverbRemoval: 0,
    deesser: 0,
    multiband: false,
    loudness: false
  },
  aggressive: {
    name: 'Полное удаление',
    voiceGain: -60,
    gameGain: 6,
    bassGain: 4,
    clarityGain: 6,
    muteMid: true,
    spectralGate: 0,
    adaptiveMode: false,
    reverbRemoval: 0,
    deesser: 0,
    multiband: false,
    loudness: false
  },
  factory: {
    name: 'Заводские настройки',
    voiceGain: 0,
    gameGain: 0,
    bassGain: 0,
    clarityGain: 0,
    muteMid: false,
    spectralGate: 0,
    adaptiveMode: false,
    reverbRemoval: 0,
    deesser: 0,
    multiband: false,
    loudness: false
  }
};

let currentPreset = null;
let pendingChanges = {};
let saveTimeout = null;

// При открытии попапа внедряем скрипты на активную вкладку
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab && (tab.url.includes('twitch.tv') || tab.url.includes('youtube.com'))) {
    // Внедряем content.js только когда открываем расширение
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }).catch(err => {
      console.log('Скрипт уже внедрен или страница не поддерживается');
    });
  }
});

// Функция для группового сохранения
function saveAllPendingChanges() {
  if (Object.keys(pendingChanges).length > 0) {
    chrome.storage.sync.set(pendingChanges, () => {
      pendingChanges = {};
    });
  }
}

// Функция дебаунса
function debouncedSave(key, value) {
  pendingChanges[key] = value;
  
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveAllPendingChanges();
  }, 500);
}

// Конфигурация слайдеров с правильными ID
const sliders = [
  { id: 'voiceGain', displayId: 'voiceValue', type: 'db' },
  { id: 'gameGain', displayId: 'gameValue', type: 'db' },
  { id: 'bassGain', displayId: 'bassValue', type: 'db' },
  { id: 'clarityGain', displayId: 'clarityValue', type: 'db' },
  { id: 'spectralGate', displayId: 'spectralValue', type: 'percent' },
  { id: 'adaptiveMode', displayId: 'adaptiveValue', type: 'toggle' },
  { id: 'reverbRemoval', displayId: 'reverbValue', type: 'percent' },
  { id: 'deesser', displayId: 'deesserValue', type: 'percent' },
  { id: 'multiband', displayId: 'multibandValue', type: 'toggle' },
  { id: 'loudness', displayId: 'loudnessValue', type: 'toggle' }
];

// Загрузка настроек
chrome.storage.sync.get(null, (data) => {
  // Загружаем тему
  if (data.darkMode) {
    document.body.classList.add('dark');
    document.getElementById('themeToggle').textContent = '☀️';
  }
  
  // Основные настройки
  document.getElementById('masterToggle').checked = data.masterEnabled || false;
  document.getElementById('voiceGain').value = data.voiceGain ?? 0;
  document.getElementById('gameGain').value = data.gameGain ?? 0;
  document.getElementById('bassGain').value = data.bassGain ?? 0;
  document.getElementById('clarityGain').value = data.clarityGain ?? 0;
  document.getElementById('muteMid').checked = data.muteMid || false;
  
  // Продвинутые настройки
  document.getElementById('spectralGate').value = data.spectralGate ?? 0;
  document.getElementById('adaptiveMode').value = data.adaptiveMode ? 1 : 0;
  document.getElementById('reverbRemoval').value = data.reverbRemoval ?? 0;
  
  // Качество
  document.getElementById('deesser').value = data.deesser ?? 0;
  document.getElementById('multiband').value = data.multiband ? 1 : 0;
  document.getElementById('loudness').value = data.loudness ? 1 : 0;
  
  currentPreset = data.currentPreset || null;
  
  // Кастомный пресет
  if (data.customPreset) {
    const btn = document.getElementById('customPresetBtn');
    document.getElementById('customPresetName').textContent = data.customPreset.name;
    btn.style.display = 'flex';
    PRESETS.custom = data.customPreset;
  }
  
  updateAllDisplays();
  updateStatus();
  updatePresetButtons();
});

// Переключение темы
document.getElementById('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌙';
  debouncedSave('darkMode', isDark);
});

// Табы
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.controls').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
  });
});

// Master toggle - без дебаунса, применяем сразу
document.getElementById('masterToggle').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  chrome.storage.sync.set({ masterEnabled: enabled }, () => {
    applySettings();
    updateStatus();
  });
});

// Mute Mid checkbox
document.getElementById('muteMid').addEventListener('change', (e) => {
  const muted = e.target.checked;
  debouncedSave('muteMid', muted);
  
  const voiceValue = document.getElementById('voiceValue');
  const voiceSlider = document.getElementById('voiceGain');
  
  if (muted) {
    voiceValue.textContent = 'MUTE';
    voiceValue.classList.add('muted');
    voiceSlider.disabled = true;
  } else {
    const value = parseFloat(voiceSlider.value);
    const formatted = value.toFixed(1);
    voiceValue.textContent = (value > 0 ? '+' : '') + formatted + ' дБ';
    voiceValue.classList.remove('muted');
    voiceSlider.disabled = false;
  }
  
  setTimeout(applySettings, 100);
  currentPreset = null;
  updatePresetButtons();
});

// Слайдеры с правильным обновлением значений
sliders.forEach(slider => {
  const element = document.getElementById(slider.id);
  if (!element) return;
  
  // Обновляем отображение при движении ползунка
  element.addEventListener('input', function(e) {
    const value = parseFloat(e.target.value);
    const displayElement = document.getElementById(slider.displayId);
    
    if (displayElement) {
      if (slider.type === 'db') {
        const formatted = value.toFixed(1);
        displayElement.textContent = (value > 0 ? '+' : '') + formatted + ' дБ';
      } else if (slider.type === 'toggle') {
        displayElement.textContent = value > 0 ? 'Вкл' : 'Выкл';
      } else if (slider.type === 'percent') {
        displayElement.textContent = Math.round(value) + '%';
      }
    }
    
    // Сохраняем с задержкой
    debouncedSave(slider.id, value);
    
    // Сбрасываем активный пресет
    if (currentPreset) {
      currentPreset = null;
      updatePresetButtons();
    }
  });
  
  // Применяем настройки при отпускании ползунка
  element.addEventListener('change', function() {
    setTimeout(applySettings, 100);
  });
});

// Пресеты - применяем все настройки одним запросом
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const presetKey = btn.dataset.preset;
    const preset = PRESETS[presetKey];
    
    if (!preset) return;
    
    // Применяем настройки к UI
    document.getElementById('voiceGain').value = preset.voiceGain;
    document.getElementById('gameGain').value = preset.gameGain;
    document.getElementById('bassGain').value = preset.bassGain;
    document.getElementById('clarityGain').value = preset.clarityGain;
    document.getElementById('muteMid').checked = preset.muteMid || false;
    document.getElementById('spectralGate').value = preset.spectralGate || 0;
    document.getElementById('adaptiveMode').value = preset.adaptiveMode ? 1 : 0;
    document.getElementById('reverbRemoval').value = preset.reverbRemoval || 0;
    document.getElementById('deesser').value = preset.deesser || 0;
    document.getElementById('multiband').value = preset.multiband ? 1 : 0;
    document.getElementById('loudness').value = preset.loudness ? 1 : 0;
    
    const voiceSlider = document.getElementById('voiceGain');
    const voiceValue = document.getElementById('voiceValue');
    
    if (preset.muteMid) {
      voiceValue.textContent = 'MUTE';
      voiceValue.classList.add('muted');
      voiceSlider.disabled = true;
    } else {
      const formatted = preset.voiceGain.toFixed(1);
      voiceValue.textContent = (preset.voiceGain > 0 ? '+' : '') + formatted + ' дБ';
      voiceValue.classList.remove('muted');
      voiceSlider.disabled = false;
    }
    
    // Сохраняем все одним запросом
    const settings = {
      voiceGain: preset.voiceGain,
      gameGain: preset.gameGain,
      bassGain: preset.bassGain,
      clarityGain: preset.clarityGain,
      muteMid: preset.muteMid || false,
      spectralGate: preset.spectralGate || 0,
      adaptiveMode: preset.adaptiveMode || false,
      reverbRemoval: preset.reverbRemoval || 0,
      deesser: preset.deesser || 0,
      multiband: preset.multiband || false,
      loudness: preset.loudness || false,
      currentPreset: presetKey
    };
    
    chrome.storage.sync.set(settings, () => {
      currentPreset = presetKey;
      updateAllDisplays();
      updatePresetButtons();
      applySettings();
    });
  });
});

// Сохранение кастомного пресета
document.getElementById('savePresetBtn').addEventListener('click', () => {
  const name = document.getElementById('presetNameInput').value.trim() || 'Мой пресет';
  
  const customPreset = {
    name: name,
    voiceGain: parseFloat(document.getElementById('voiceGain').value),
    gameGain: parseFloat(document.getElementById('gameGain').value),
    bassGain: parseFloat(document.getElementById('bassGain').value),
    clarityGain: parseFloat(document.getElementById('clarityGain').value),
    muteMid: document.getElementById('muteMid').checked,
    spectralGate: parseFloat(document.getElementById('spectralGate').value),
    adaptiveMode: document.getElementById('adaptiveMode').value === '1',
    reverbRemoval: parseFloat(document.getElementById('reverbRemoval').value),
    deesser: parseFloat(document.getElementById('deesser').value),
    multiband: document.getElementById('multiband').value === '1',
    loudness: document.getElementById('loudness').value === '1'
  };
  
  chrome.storage.sync.set({ 
    customPreset: customPreset,
    currentPreset: 'custom'
  }, () => {
    PRESETS.custom = customPreset;
    const btn = document.getElementById('customPresetBtn');
    document.getElementById('customPresetName').textContent = name;
    btn.style.display = 'flex';
    document.getElementById('presetNameInput').value = '';
    currentPreset = 'custom';
    updatePresetButtons();
  });
});

// Вспомогательные функции
function updateAllDisplays() {
  sliders.forEach(slider => {
    const element = document.getElementById(slider.id);
    const displayElement = document.getElementById(slider.displayId);
    
    if (!element || !displayElement) return;
    
    const value = parseFloat(element.value);
    
    if (slider.type === 'db') {
      const formatted = value.toFixed(1);
      displayElement.textContent = (value > 0 ? '+' : '') + formatted + ' дБ';
    } else if (slider.type === 'toggle') {
      displayElement.textContent = value > 0 ? 'Вкл' : 'Выкл';
    } else if (slider.type === 'percent') {
      displayElement.textContent = Math.round(value) + '%';
    }
  });
  
  // Особый случай для Mute Mid
  if (document.getElementById('muteMid').checked) {
    document.getElementById('voiceValue').textContent = 'MUTE';
    document.getElementById('voiceValue').classList.add('muted');
    document.getElementById('voiceGain').disabled = true;
  }
}

function updateStatus() {
  const enabled = document.getElementById('masterToggle').checked;
  const status = document.getElementById('status');
  
  if (enabled) {
    status.textContent = 'Обработка активна';
    status.classList.add('active');
  } else {
    status.textContent = 'Выключено';
    status.classList.remove('active');
  }
}

function updatePresetButtons() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.preset === currentPreset) {
      btn.classList.add('active');
    }
  });
}

function applySettings() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'updateSettings'
      }).catch(() => {});
    }
  });
}