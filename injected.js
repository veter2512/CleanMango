(function() {
  let audioContext = null;
  let sourceNode = null;
  let isActive = false;
  
  // Основные узлы
  let splitter = null;
  let merger = null;
  let midGain = null;
  let sideGain = null;
  let lowShelf = null;
  let highShelf = null;
  
  let settings = {
    masterEnabled: false,
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
  };

  let mediaElement = null;
  let reconnectAttempts = 0;

  function findMediaElement() {
    return document.querySelector('video') || document.querySelector('audio');
  }

  function initAudioProcessing() {
    if (isActive) return;
    
    mediaElement = findMediaElement();
    if (!mediaElement) {
      console.log('[CleanMango] Медиа элемент не найден');
      return;
    }

    try {
      // НЕ меняем crossOrigin - это вызывает паузу!
      // media.crossOrigin = "anonymous"; // УБИРАЕМ ЭТО
      
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Проверяем, не подключен ли уже источник
      if (!sourceNode) {
        try {
          // Сохраняем текущее состояние воспроизведения
          const wasPlaying = !mediaElement.paused;
          const currentTime = mediaElement.currentTime;
          
          sourceNode = audioContext.createMediaElementSource(mediaElement);
          
          // Если видео было на паузе после подключения, продолжаем воспроизведение
          if (wasPlaying && mediaElement.paused) {
            mediaElement.currentTime = currentTime;
            mediaElement.play().catch(() => {});
          }
        } catch(e) {
          if (e.name === 'InvalidStateError') {
            console.log('[CleanMango] Медиа элемент уже подключен к другому контексту');
            return;
          }
          console.log('[CleanMango] Ошибка создания источника:', e.message);
          return;
        }
      }
      
      // Создаем простую цепь обработки
      splitter = audioContext.createChannelSplitter(2);
      merger = audioContext.createChannelMerger(2);
      
      midGain = audioContext.createGain();
      sideGain = audioContext.createGain();
      
      // Mid/Side матрица (упрощенная)
      const midSum = audioContext.createGain();
      const sideSum = audioContext.createGain();
      
      // Mid = (L+R)/2
      splitter.connect(midSum, 0);
      splitter.connect(midSum, 1);
      midSum.gain.value = 0.5;
      midSum.connect(midGain);
      
      // Side = (L-R)/2  
      const sideInv = audioContext.createGain();
      sideInv.gain.value = -1;
      
      splitter.connect(sideSum, 0);
      splitter.connect(sideInv, 1);
      sideInv.connect(sideSum);
      sideSum.gain.value = 0.5;
      sideSum.connect(sideGain);
      
      // Простой EQ только если нужно
      if (settings.bassGain !== 0 || settings.clarityGain !== 0) {
        lowShelf = audioContext.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 200;
        
        highShelf = audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 4000;
        
        sideGain.connect(lowShelf);
        lowShelf.connect(highShelf);
        highShelf.connect(merger, 0, 0);
        highShelf.connect(merger, 0, 1);
      } else {
        sideGain.connect(merger, 0, 0);
        sideGain.connect(merger, 0, 1);
      }
      
      // Подключаем Mid
      midGain.connect(merger, 0, 0);
      midGain.connect(merger, 0, 1);
      
      // Финальное подключение
      sourceNode.connect(splitter);
      merger.connect(audioContext.destination);
      
      updateAudioParams();
      isActive = true;
      reconnectAttempts = 0;
      
      console.log('[CleanMango] ✓ Обработка активирована');
    } catch (e) {
      console.error('[CleanMango] Ошибка:', e);
      
      // Если ошибка - просто подключаем напрямую
      if (sourceNode && audioContext) {
        try {
          sourceNode.connect(audioContext.destination);
        } catch(e2) {}
      }
      
      // Пробуем переподключиться через секунду
      if (reconnectAttempts < 3) {
        reconnectAttempts++;
        setTimeout(() => {
          isActive = false;
          initAudioProcessing();
        }, 1000);
      }
    }
  }

  function updateAudioParams() {
    if (!isActive || !audioContext) return;
    
    try {
      // Mid/Side баланс
      if (midGain) {
        if (settings.muteMid) {
          midGain.gain.value = 0;
        } else {
          const val = Math.pow(10, settings.voiceGain / 20);
          midGain.gain.value = val;
        }
      }
      
      if (sideGain) {
        sideGain.gain.value = Math.pow(10, settings.gameGain / 20);
      }
      
      // EQ
      if (lowShelf) {
        lowShelf.gain.value = settings.bassGain;
      }
      
      if (highShelf) {
        highShelf.gain.value = settings.clarityGain;
      }
    } catch(e) {
      console.error('[CleanMango] Ошибка обновления параметров:', e);
    }
  }

  function stopProcessing() {
    try {
      if (sourceNode && audioContext) {
        sourceNode.disconnect();
        sourceNode.connect(audioContext.destination);
      }
    } catch(e) {}
    
    isActive = false;
    console.log('[CleanMango] Обработка остановлена');
  }

  // Слушаем сообщения
  window.addEventListener('message', (event) => {
    if (event.data.type === 'AUDIO_ENGINE_UPDATE') {
      const oldEnabled = settings.masterEnabled;
      Object.assign(settings, event.data.settings);
      
      if (settings.masterEnabled) {
        if (!oldEnabled || !isActive || event.data.forceReinit) {
          // Задержка чтобы избежать конфликтов
          stopProcessing();
          setTimeout(() => {
            initAudioProcessing();
          }, 200);
        } else {
          updateAudioParams();
        }
      } else {
        stopProcessing();
      }
    }
    
    if (event.data.type === 'AUDIO_ENGINE_GET_STATUS') {
      window.postMessage({ type: 'AUDIO_ENGINE_STATUS', active: isActive }, '*');
    }
  });

  // Проверяем медиа реже, чтобы не лагало
  setInterval(() => {
    if (settings.masterEnabled && !isActive) {
      const media = findMediaElement();
      if (media && media.readyState >= 2) { // Ждем пока медиа загрузится
        initAudioProcessing();
      }
    }
  }, 3000);
  
  console.log('[CleanMango] Готов к работе');
})();