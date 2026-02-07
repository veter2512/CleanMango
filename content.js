// Внедряем основной скрипт
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function() {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Слушаем сообщения из popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateSettings' || request.action === 'forceUpdate') {
    chrome.storage.sync.get([
      'masterEnabled', 
      'voiceGain', 
      'gameGain', 
      'bassGain', 
      'clarityGain',
      'muteMid',
      'spectralGate',
      'adaptiveMode',
      'reverbRemoval',
      'deesser',
      'multiband',
      'loudness'
    ], (data) => {
      window.postMessage({
        type: 'AUDIO_ENGINE_UPDATE',
        settings: data,
        forceReinit: request.action === 'forceUpdate'
      }, '*');
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getStatus') {
    window.postMessage({ type: 'AUDIO_ENGINE_GET_STATUS' }, '*');
    
    const listener = (event) => {
      if (event.data.type === 'AUDIO_ENGINE_STATUS') {
        window.removeEventListener('message', listener);
        sendResponse(event.data);
      }
    };
    window.addEventListener('message', listener);
    
    setTimeout(() => {
      window.removeEventListener('message', listener);
      sendResponse({ active: false });
    }, 500);
    
    return true;
  }
});

// Отправляем начальные настройки
setTimeout(() => {
  chrome.storage.sync.get([
    'masterEnabled', 
    'voiceGain', 
    'gameGain', 
    'bassGain', 
    'clarityGain',
    'muteMid',
    'spectralGate',
    'adaptiveMode',
    'reverbRemoval',
    'deesser',
    'multiband',
    'loudness'
  ], (data) => {
    window.postMessage({
      type: 'AUDIO_ENGINE_UPDATE',
      settings: data
    }, '*');
  });
}, 1000);