import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

document.addEventListener('DOMContentLoaded', () => {
    // DOM 요소 가져오기
    const video = document.getElementById("input-video");
    const canvasElement = document.getElementById("output-canvas");
    const canvasCtx = canvasElement.getContext("2d");
    const cursor = document.getElementById("cursor");
    const startButton = document.getElementById("start-button");
    const permissionMessage = document.getElementById("permission-message");

    // 일반 마우스 커서용 DOM 생성 및 추가 (웹캠 미사용 시 대비)
    const mouseCursor = document.createElement('div');
    mouseCursor.id = 'mouse-cursor';
    document.body.appendChild(mouseCursor);

    // 마우스 움직임에 따라 일반 커서 위치 이동
    window.addEventListener('mousemove', (e) => {
        mouseCursor.style.left = `${e.clientX}px`;
        mouseCursor.style.top = `${e.clientY}px`;
    });

    // 게임 상태 변수
    let currentSceneId = 'scene-start';
    let handLandmarker;
    let lastVideoTime = -1;
    let sceneState = {};
    let pinchWasActive = false;

    // 게임 시작 및 MediaPipe 초기화
    async function initializeGame() {
        console.log("initializeGame 실행됨");
        // 1. 페이드 아웃(검정 오버레이 등장)
        const fadeOverlay = document.getElementById('fade-overlay');
        fadeOverlay.classList.add('active');
        setTimeout(async () => {
            // 2. scene-start 숨기기
            const sceneStart = document.getElementById('scene-start');
            if (sceneStart) sceneStart.classList.remove('active');
            // 3. 기존 초기화 로직 실행
            permissionMessage.style.display = 'none';
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
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
                video.srcObject = stream;
                video.addEventListener("loadeddata", () => {
                    console.log("video loadeddata 이벤트 발생");
                    video.play().then(() => {
                        console.log("video.play() 성공");
                    }).catch(e => {
                        console.error("video.play() 실패:", e);
                    });
                    predictWebcam();
                    startIntro();
                });
            } catch (err) {
                console.error("웹캠 접근에 실패했습니다:", err);
                permissionMessage.innerHTML = "웹캠을 사용할 수 없습니다. <br> 카메라 권한을 확인하고 새로고침 해주세요.";
                permissionMessage.style.display = 'block';
            }
            // 4. 페이드 인(검정 오버레이 사라짐)
            setTimeout(() => {
                fadeOverlay.classList.remove('active');
            }, 1500);
        }, 1500);
    }

    // 시작 버튼에 클릭 이벤트 연결
    startButton.addEventListener('click', initializeGame);

    // (수정됨) 안정성을 개선한 인트로 함수
    function startIntro() {
        const vibrationSound = document.getElementById('vibration-sound');
        const voicemailSound = document.getElementById('voicemail-sound');
        const phoneImage = document.getElementById('phone-image');

        if (vibrationSound) {
            vibrationSound.play().catch(e => console.error("진동 소리 재생 실패:", e));
        }

        setTimeout(() => {
            phoneImage.classList.add('visible');
            let transitioned = false;
            const goNext = () => {
                if (transitioned) return;
                transitioned = true;
                phoneImage.classList.remove('visible');
                setTimeout(() => {
                    switchScene('scene-1');
                }, 1500);
            };

            if (voicemailSound) {
                voicemailSound.onended = goNext;
                voicemailSound.play()
                    .catch(error => {
                        console.error("음성사서함 소리 재생 실패:", error);
                        setTimeout(goNext, 3000);
                    });
                // 10초 후에도 onended가 안 되면 강제 전환
                setTimeout(goNext, 10000);
            } else {
                // audio 태그가 없으면 3초 후 강제 전환
                setTimeout(goNext, 3000);
            }
        }, 5000);
    }

    // 장면 전환 함수
    function switchScene(sceneId) {
        const fadeOverlay = document.getElementById('fade-overlay');
        // 1. 페이드 아웃(검정 오버레이 등장)
        fadeOverlay.classList.add('active');
        setTimeout(() => {
            // 2. 실제 씬 전환
            const currentScene = document.getElementById(currentSceneId);
            const nextScene = document.getElementById(sceneId);
            if (currentScene) currentScene.classList.remove('active');
            if (nextScene) {
                nextScene.classList.add('active');
                currentSceneId = sceneId;
                sceneState[currentSceneId] = {
                    clickedCards: new Set()
                };
                if (sceneId === 'scene-end') {
                    const endingTitle = document.getElementById('ending-title');
                    setTimeout(() => endingTitle.classList.add('visible'), 500);
                }
            }
            // 3. 페이드 인(검정 오버레이 사라짐)
            setTimeout(() => {
                fadeOverlay.classList.remove('active');
            }, 1500);
        }, 1500);
    }

    // 웹캠 프레임 예측 및 렌더링 루프
    function predictWebcam() {
        // console.log("predictWebcam 루프"); // 너무 자주 찍히므로 주석 처리
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
        // console.log("video.currentTime:", video.currentTime, "lastVideoTime:", lastVideoTime); // 필요시만 사용
        if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            console.log("detectForVideo 호출");
            try {
                const results = handLandmarker.detectForVideo(video, performance.now());
                console.log("detectForVideo 반환값:", results);
                if (results.landmarks && results.landmarks.length > 0) {
                    console.log("손 인식됨!", results.landmarks[0]);
                    const landmarks = results.landmarks[0];
                    drawLandmarks(landmarks);
                    handleHandTracking(landmarks);
                } else {
                    console.log("손 인식 안됨");
                }
            } catch (e) {
                console.error("detectForVideo 호출 중 예외 발생:", e);
            }
        }
        requestAnimationFrame(predictWebcam);
    }

    // 손가락 마디 그리기 (디버깅용)
    function drawLandmarks(landmarks) {
        // 아무것도 그리지 않음 (조인트 완전 비활성화)
    }

    // 손 추적 및 인터랙션 처리
    function handleHandTracking(landmarks) {
        // 검지 끝(INDEX_FINGER_TIP, landmark 8) 좌표
        const indexFingerTip = landmarks[8];
        const cursorX = (1 - indexFingerTip.x) * window.innerWidth; // x좌표 반전
        const cursorY = indexFingerTip.y * window.innerHeight;

        // 커서 위치 업데이트
        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;

        // 커서 원의 반지름 (CSS에서 가져옴)
        const cursorRadius = parseFloat(getComputedStyle(cursor).width) / 2;

        // 호버(Hover) 감지 (커서 원 중심이 카드와 겹치면 호버)
        const cards = document.querySelectorAll(`#${currentSceneId} .card-container`);
        let hoveredCard = null;
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // 카드 영역과 커서 원 중심이 겹치는지 판정
            const closestX = Math.max(rect.left, Math.min(cursorX, rect.right));
            const closestY = Math.max(rect.top, Math.min(cursorY, rect.bottom));
            const dist = Math.hypot(cursorX - closestX, cursorY - closestY);
            if (dist < cursorRadius) {
                hoveredCard = card;
            }
            card.classList.remove('hover', 'pinch-outline');
        });

        // 핀치(Pinch) 감지
        const thumbTip = landmarks[4];
        const distance = Math.hypot(indexFingerTip.x - thumbTip.x, indexFingerTip.y - thumbTip.y);
        const isPinching = distance < 0.04; // 핀치 감지 임계값
        cursor.classList.toggle('pinch', isPinching);

        // 핀치 상태(뒷면)일 때만 아웃라인 효과 적용
        if (hoveredCard) {
            if (isPinching) {
                hoveredCard.classList.add('pinch-outline');
            }
            hoveredCard.classList.add('hover');
        }

        // 핀치 동작이 시작되는 순간(클릭)
        if (isPinching && !pinchWasActive) {
            if (hoveredCard) {
                handleCardClick(hoveredCard);
            }
        }
        pinchWasActive = isPinching;
    }

    // 카드 클릭(핀치) 이벤트 처리
    function handleCardClick(card) {
        const sceneConfig = {
            'scene-1': { nextScene: 'scene-2', requiredClicks: 1, check: (c) => c.dataset.correct === 'true' },
            'scene-2': { nextScene: 'scene-3', requiredClicks: 3 },
            'scene-3': { nextScene: 'scene-4', requiredClicks: 3 },
            'scene-4': { nextScene: 'scene-end', requiredClicks: 3 },
        };
        const config = sceneConfig[currentSceneId];
        if (!config) return;

        const state = sceneState[currentSceneId];
        if (!state.clickedCards.has(card.id)) {
            card.classList.add('clicked');
            state.clickedCards.add(card.id);
        }

        if (config.check) { // 특정 카드만 클릭해야 하는 경우 (scene-1)
            if (config.check(card)) {
                setTimeout(() => switchScene(config.nextScene), 800);
            }
        } else { // 모든 카드를 클릭해야 하는 경우
            if (state.clickedCards.size === config.requiredClicks) {
                setTimeout(() => switchScene(config.nextScene), 800);
            }
        }
    }
});