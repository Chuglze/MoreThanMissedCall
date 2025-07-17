import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM 요소 가져오기 ---
    const video = document.getElementById("input-video");
    const canvasElement = document.getElementById("output-canvas");
    const canvasCtx = canvasElement.getContext("2d");
    const cursor = document.getElementById("cursor");
    const startButton = document.getElementById("start-button");
    const permissionMessage = document.getElementById("permission-message");
    const fadeOverlay = document.getElementById('fade-overlay');

    // --- 게임 상태 변수 ---
    let handLandmarker;
    let currentSceneId = 'scene-start';
    let sceneState = {};
    let pinchWasActive = false;
    let webcamRunning = false;

    // --- MediaPipe 초기화 ---
    async function createHandLandmarker() {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1
        });
        // 시작 버튼 활성화
        startButton.disabled = false;
        startButton.textContent = "게임 시작";
    }
    // 페이지 로드 시 바로 초기화 시작
    startButton.disabled = true;
    startButton.textContent = "모델 로딩 중...";
    await createHandLandmarker();


    // --- 웹캠 활성화 (수정됨) ---
    async function enableWebcam() {
        if (webcamRunning) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            video.srcObject = stream;
            
            // 'playing' 이벤트를 기다려서 비디오가 실제로 재생될 때 루프를 시작합니다.
            video.addEventListener("playing", () => {
                webcamRunning = true;
                // 예측 루프를 여기서 시작합니다.
                predictWebcam();
            });

            // 'loadeddata'가 발생하면 재생을 시도합니다.
            video.addEventListener("loadeddata", () => {
                video.play();
            });

        } catch (err) {
            console.error("웹캠 접근에 실패했습니다:", err);
            permissionMessage.innerHTML = "웹캠을 사용할 수 없습니다. <br> 카메라 권한을 확인하고 새로고침 해주세요.";
        }
    }

    // --- 게임 시작 로직 ---
    startButton.addEventListener('click', async () => {
        fadeOverlay.classList.add('active');
        await enableWebcam(); // 웹캠을 먼저 켜고
        // 커서 표시
        cursor.style.display = 'block';
        setTimeout(() => {
            document.getElementById('scene-start').style.display = 'none'; // 시작 화면 완전히 숨기기
            // 튜토리얼 씬 보여주기
            document.getElementById('scene-tutorial').classList.add('active');
            currentSceneId = 'scene-tutorial'; // 튜토리얼 활성화
            fadeOverlay.classList.remove('active');
        }, 800);
    });

    // --- 튜토리얼 다음 버튼 ---
    document.getElementById('tutorial-next-button').addEventListener('click', () => {
        // 튜토리얼 씬 숨기고, 인트로 연출로 이동
        document.getElementById('scene-tutorial').classList.remove('active');
        currentSceneId = 'scene-start'; // 인트로 연출은 scene-start에서 진행
        // 배경음악 재생 (이미 재생 중이 아니면)
        const bgm = document.getElementById('bgm');
        if (bgm && bgm.paused) {
            bgm.currentTime = 0;
            bgm.play().catch(() => {});
        }
        startIntro();
    });

    // --- 인트로 시퀀스 ---
    function startIntro() {
        const vibrationSound = document.getElementById('vibration-sound');
        const voicemailSound = document.getElementById('voicemail-sound');
        const phoneImage = document.getElementById('phone-image');

        vibrationSound?.play().catch(e => console.error("진동 소리 재생 실패:", e));

        setTimeout(() => {
            phoneImage.classList.add('visible');
            let transitioned = false;
            const goNext = () => {
                if (transitioned) return;
                transitioned = true;
                phoneImage.classList.remove('visible');
                setTimeout(() => switchScene('scene-1'), 1500);
            };

            voicemailSound.onended = goNext;
            voicemailSound.play().catch(() => setTimeout(goNext, 3000));
        }, 5000);
    }

    // --- 장면 전환 ---
    function switchScene(sceneId) {
        fadeOverlay.classList.add('active');

        // transitionend 핸들러 정의
        function onFadeInEnd(e) {
            if (e.propertyName !== 'opacity') return;
            fadeOverlay.removeEventListener('transitionend', onFadeInEnd);

            // 오버레이가 완전히 검게 된 후 씬 전환
            document.getElementById(currentSceneId)?.classList.remove('active');
            const nextScene = document.getElementById(sceneId);
            if (nextScene) {
                nextScene.classList.add('active');
                currentSceneId = sceneId;
                sceneState[currentSceneId] = { clickedCards: new Set() };
                if (sceneId === 'scene-end') {
                    document.getElementById('ending-title')?.classList.add('visible');
                }
            }

            // 오버레이를 다시 사라지게(페이드인)
            function onFadeOutEnd(e2) {
                if (e2.propertyName !== 'opacity') return;
                fadeOverlay.removeEventListener('transitionend', onFadeOutEnd);
            }
            fadeOverlay.addEventListener('transitionend', onFadeOutEnd);
            fadeOverlay.classList.remove('active');
        }
        fadeOverlay.addEventListener('transitionend', onFadeInEnd);
    }

    // --- 핵심 예측 루프 (수정됨) ---
    let lastVideoTime = -1;
    function predictWebcam() {
        // 루프의 시작에 requestAnimationFrame을 배치하여 중단되지 않도록 합니다.
        window.requestAnimationFrame(predictWebcam);

        // 웹캠이 실행 중이 아니거나 비디오가 준비되지 않았으면 아무것도 하지 않습니다.
        if (!webcamRunning || video.paused || video.ended) {
            return;
        }

        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;

        const startTimeMs = performance.now();
        if (lastVideoTime !== video.currentTime) {
            lastVideoTime = video.currentTime;
            const results = handLandmarker.detectForVideo(video, startTimeMs);
            
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            if (results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];
                //drawLandmarks(landmarks); // 디버깅을 위해 랜드마크 그리기
                handleHandTracking(landmarks);
            }
        }
    }

    // --- 랜드마크 그리기 (디버깅용) ---
    function drawLandmarks(landmarks) {
        for (const landmark of landmarks) {
            canvasCtx.beginPath();
            canvasCtx.arc(
                (1 - landmark.x) * canvasElement.width, // 거울 모드
                landmark.y * canvasElement.height,
                5, 0, 2 * Math.PI
            );
            canvasCtx.fillStyle = "rgba(0, 255, 150, 0.7)";
            canvasCtx.fill();
        }
    }

    // --- 손 추적 및 인터랙션 처리 ---
    function handleHandTracking(landmarks) {
        const indexFingerTip = landmarks[8];
        const thumbTip = landmarks[4];
        
        const cursorX = (1 - indexFingerTip.x) * window.innerWidth;
        const cursorY = indexFingerTip.y * window.innerHeight;

        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;

        const distance = Math.hypot(indexFingerTip.x - thumbTip.x, indexFingerTip.y - thumbTip.y);
        const isPinching = distance < 0.04;

        cursor.classList.toggle('pinch', isPinching);

        // 시작 화면: 게임 시작 버튼 핀치 지원
        if (currentSceneId === 'scene-start') {
            const btn = document.getElementById('start-button');
            const rect = btn.getBoundingClientRect();
            const isHover = (cursorX > rect.left && cursorX < rect.right && cursorY > rect.top && cursorY < rect.bottom);
            btn.classList.toggle('hover', isHover);
            if (isPinching && !pinchWasActive && isHover) {
                btn.click();
            }
            pinchWasActive = isPinching;
            return;
        }

        // 튜토리얼 씬: 버튼 핀치 지원
        if (currentSceneId === 'scene-tutorial') {
            const btn = document.getElementById('tutorial-next-button');
            const rect = btn.getBoundingClientRect();
            const isHover = (cursorX > rect.left && cursorX < rect.right && cursorY > rect.top && cursorY < rect.bottom);
            btn.classList.toggle('hover', isHover);
            if (isPinching && !pinchWasActive && isHover) {
                btn.click();
            }
            pinchWasActive = isPinching;
            return;
        }

        // summary 씬: 버튼 핀치 지원
        if (currentSceneId === 'scene-summary') {
            const btn = document.getElementById('summary-next-button');
            const rect = btn.getBoundingClientRect();
            const isHover = (cursorX > rect.left && cursorX < rect.right && cursorY > rect.top && cursorY < rect.bottom);
            btn.classList.toggle('hover', isHover);
            if (isPinching && !pinchWasActive && isHover) {
                btn.click();
            }
            pinchWasActive = isPinching;
            return;
        }

        const cards = document.querySelectorAll(`#${currentSceneId} .card-container`);
        let hoveredCard = null;

        // 1. 어떤 카드가 호버되었는지 먼저 찾는다.
        for (const card of cards) {
            const rect = card.getBoundingClientRect();
            if (cursorX > rect.left && cursorX < rect.right && cursorY > rect.top && cursorY < rect.bottom) {
                hoveredCard = card;
                break; // 하나 찾으면 더 이상 찾을 필요 없음
            }
        }

        // 2. 찾은 결과를 바탕으로 모든 카드에 클래스를 적용/제거한다.
        cards.forEach(card => {
            const isCurrentlyHovered = (card === hoveredCard);
            card.classList.toggle('hover', isCurrentlyHovered);
            card.classList.toggle('pinch-outline', isCurrentlyHovered && isPinching);
        });


        // 3. 핀치 동작이 "시작되는 순간"에만 클릭을 처리한다.
        if (isPinching && !pinchWasActive) {
            if (hoveredCard) {
                handleCardClick(hoveredCard);
            }
        }
        pinchWasActive = isPinching;
    }

    // --- 카드 클릭 처리 ---
    function handleCardClick(card) {
        const sceneConfig = {
            'scene-1': { nextScene: 'scene-2', requiredClicks: 1, check: (c) => c.dataset.correct === 'true' },
            'scene-2': { nextScene: 'scene-3', requiredClicks: 3 },
            'scene-3': { nextScene: 'scene-4', requiredClicks: 3 },
            'scene-4': { nextScene: 'scene-summary', requiredClicks: 3 },
        };
        const config = sceneConfig[currentSceneId];
        if (!config) return;

        const state = sceneState[currentSceneId];
        if (state && !state.clickedCards.has(card.id)) {
            card.classList.add('clicked');
            state.clickedCards.add(card.id);
        }

        if (config.check) {
            if (config.check(card)) switchScene(config.nextScene);
        } else {
            if (state.clickedCards.size >= config.requiredClicks) {
                switchScene(config.nextScene);
            }
        }
    }

    // --- summary-next-button: 엔딩으로 이동 ---
    document.getElementById('summary-next-button').addEventListener('click', () => {
        document.getElementById('scene-summary').classList.remove('active');
        currentSceneId = 'scene-end';
        switchScene('scene-end');
    });
});
