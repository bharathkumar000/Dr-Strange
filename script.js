const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const magicCanvas = document.getElementById('magicCanvas');
const ctx = canvas.getContext('2d');
const magicCtx = magicCanvas.getContext('2d');
const status = document.getElementById('status');
const cameraToggle = document.getElementById('cameraToggle');
const cameraIcon = document.getElementById('cameraIcon');
const cameraText = document.getElementById('cameraText');
const handTracking = document.getElementById('handTracking');
const indicatorText = document.querySelector('.indicator-text');

let handDetected = false;
let palmCenters = [];
let particles = [];
let cameraActive = true;
let cameraStream = null;
let currentCamera = null;
let handCircles = new Map();
let videoRect = { width: 0, height: 0, x: 0, y: 0 };
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// Initialize camera with optimized settings
async function setupCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        video.srcObject = cameraStream;
        cameraActive = true;

        video.onloadedmetadata = () => {
            // Initial canvas resize to match video
            resizeCanvas();
        };
    } catch (error) {
        console.error('Camera error:', error);
        status.textContent = 'Camera access denied!';
    }
}

// Initialize MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1, // Better accuracy for magic circle tracking
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

hands.onResults(onResults);

// --- RESIZE HANDLER ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    magicCanvas.width = window.innerWidth;
    magicCanvas.height = window.innerHeight;

    const windowRatio = window.innerWidth / window.innerHeight;
    const videoRatio = VIDEO_WIDTH / VIDEO_HEIGHT;

    // Logic for object-fit: cover
    let drawWidth, drawHeight;

    if (windowRatio > videoRatio) {
        // Screen is wider than video: Video width = Screen width, Video height is scaled up
        drawWidth = window.innerWidth;
        drawHeight = window.innerWidth / videoRatio;
    } else {
        // Screen is taller than video: Video height = Screen height, Video width is scaled up
        drawHeight = window.innerHeight;
        drawWidth = window.innerHeight * videoRatio;
    }

    videoRect = {
        width: drawWidth,
        height: drawHeight,
        x: (window.innerWidth - drawWidth) / 2,
        y: (window.innerHeight - drawHeight) / 2
    };
}

window.addEventListener('resize', resizeCanvas);

// --- COORDINATE MAPPING ---
// Maps MediaPipe (0-1) coordinates to Screen pixels, accounting for mirror & crop
function mapCoordinates(x, y) {
    // 1. Mirror X (since video is mirrored)
    // MediaPipe X is 0(left)..1(right) of the original camera feed.
    // CSS scaleX(-1) calculates visual as (1-x).
    const mirroredX = 1 - x;

    // 2. Scale and Offset
    const screenX = mirroredX * videoRect.width + videoRect.x;
    const screenY = y * videoRect.height + videoRect.y;

    return { x: screenX, y: screenY };
}


// --- MOVIE-QUALITY MAGIC CIRCLE (REFINED) ---
class EldritchDisc {
    constructor(x, y, handId) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.baseRadius = 150;
        this.currentRadius = 0;
        this.angle = 0;
        this.opacity = 0;
        this.handId = handId;
        this.active = true;

        this.sparks = [];

        // Complex Geometry Definition
        this.layers = [
            // { r: radius multiplier, speed: rotation speed, width: line width, dash: dash pattern }
            { r: 0.3, speed: 0.05, w: 3, dash: [] }, // Inner core ring
            { r: 0.5, speed: -0.03, w: 2, dash: [10, 5] }, // Middle dashed
            { r: 0.75, speed: 0.02, w: 1, dash: [30, 20, 5, 20] }, // Outer intricate
            { r: 0.95, speed: -0.01, w: 4, dash: [2, 10] }, // Outer heavy segments
            { r: 1.1, speed: 0.04, w: 1, dash: [] }, // Boundary line
        ];
    }

    update(targetX, targetY) {
        // Smooth positioning with slight elastic effect
        this.x += (targetX - this.x) * 0.25;
        this.y += (targetY - this.y) * 0.25;

        // Opening animation
        if (this.active) {
            this.currentRadius += (this.baseRadius - this.currentRadius) * 0.12;
            this.opacity = Math.min(1, this.opacity + 0.1);
        }

        this.angle += 0.025;

        // Emitting Sparks (Chaos Effect)
        // Emit more sparks when moving fast or randomly
        const speed = Math.hypot(targetX - this.x, targetY - this.y);
        const sparkCount = 2 + Math.floor(speed * 0.2);

        for (let i = 0; i < sparkCount; i++) {
            if (Math.random() > 0.3) continue;

            // Random point on the outer edge
            const angle = Math.random() * Math.PI * 2;
            // Sparks fly OUTWARD from the ring
            const r = this.currentRadius * (0.8 + Math.random() * 0.4);

            this.sparks.push({
                x: this.x + Math.cos(angle) * r,
                y: this.y + Math.sin(angle) * r,
                vx: Math.cos(angle) * (2 + Math.random() * 4) + (Math.random() - 0.5), // Outward velocity
                vy: Math.sin(angle) * (2 + Math.random() * 4) + (Math.random() - 0.5) - 1, // Slight gravity upward (heat rises)
                life: 1.0,
                size: 1 + Math.random() * 2,
                color: Math.random() > 0.7 ? '#ffffff' : '#ff9900' // Mix of white hot and orange
            });
        }

        // Shield/Square Rotation logic
        // We calculate this during draw for stateless rotation
    }

    draw(ctx) {
        if (this.opacity <= 0.01) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = this.opacity;
        ctx.globalCompositeOperation = 'lighter'; // Essential for the "Fire" look

        const r = this.currentRadius;

        // 1. Hot Core (Gradient)
        let grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
        grad.addColorStop(0, 'rgba(255, 255, 200, 1)'); // White hot center
        grad.addColorStop(0.4, 'rgba(255, 150, 0, 0.8)'); // Orange body
        grad.addColorStop(1, 'rgba(255, 50, 0, 0)'); // Red fade
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
        ctx.fill();

        // 2. Rotating Squares (The Mandelbrot-esque Shield)
        ctx.strokeStyle = '#ffae00';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff4400';
        ctx.lineWidth = 2;

        for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.rotate(this.angle * (i % 2 == 0 ? 1 : -1) + (i * Math.PI / 4));
            const size = r * 0.65;
            ctx.strokeRect(-size / 2, -size / 2, size, size);
            ctx.restore();
        }

        // 3. Concentric Rings
        this.layers.forEach(layer => {
            ctx.save();
            ctx.rotate(this.angle * layer.speed * 20);
            ctx.beginPath();
            ctx.arc(0, 0, r * layer.r, 0, Math.PI * 2);

            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = layer.w;
            ctx.setLineDash(layer.dash);
            ctx.stroke();
            ctx.restore();
        });

        // 4. Runes / Glyphs
        ctx.save();
        ctx.rotate(-this.angle * 0.5);
        const runeCount = 12;
        for (let i = 0; i < runeCount; i++) {
            ctx.save();
            ctx.rotate((i / runeCount) * Math.PI * 2);
            ctx.translate(r * 0.85, 0);
            // Draw a simple glyph shape
            ctx.fillStyle = 'rgba(255, 200, 100, 0.8)';
            ctx.fillRect(-2, -5, 4, 10);
            ctx.fillRect(-5, -2, 10, 4);
            ctx.restore();
        }
        ctx.restore();

        // 5. Sparks (Rendering)
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            let s = this.sparks[i];

            ctx.fillStyle = s.color;
            ctx.globalAlpha = s.life * this.opacity;

            ctx.beginPath();
            ctx.arc(s.x - this.x, s.y - this.y, s.size, 0, Math.PI * 2);
            ctx.fill();

            // Update spark logic here for efficiency
            s.x += s.vx;
            s.y += s.vy;
            s.vx *= 0.95; // Air resistance
            s.vy *= 0.95;
            s.life -= 0.03;

            if (s.life <= 0) this.sparks.splice(i, 1);
        }

        ctx.restore();
    }
}

// --- MAIN LOOP ---

// Process hand detection results
function onResults(results) {
    if (!cameraActive) return;

    // Clear background
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Standard canvas clear
    // Magic canvas clear happens in animate loop, but we can do it here if we merge logic.
    // Keeping separate for now to match structure.

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handDetected = true;
        status.textContent = '⚡ Spells Active';

        // UI
        handTracking.classList.add('active');
        const count = results.multiHandLandmarks.length;
        indicatorText.textContent = `${count} Hand${count > 1 ? 's' : ''} Active`;

        // Track Hands
        let currentHandIds = new Set();

        results.multiHandLandmarks.forEach((landmarks, index) => {
            currentHandIds.add(index);

            // 1. Get Geometry Center
            const wrist = landmarks[0];
            const middle = landmarks[9]; // Middle finger MCP

            // Average for stable center
            const rawX = (wrist.x + middle.x) / 2;
            const rawY = (wrist.y + middle.y) / 2;

            // 2. Map to Screen
            const screenPos = mapCoordinates(rawX, rawY);

            // 3. Update or Create Disc
            if (!handCircles.has(index)) {
                handCircles.set(index, new EldritchDisc(screenPos.x, screenPos.y, index));
            }

            const disc = handCircles.get(index);
            disc.update(screenPos.x, screenPos.y);
        });

        // Remove lost hands
        for (let [id, disc] of handCircles) {
            if (!currentHandIds.has(id)) {
                handCircles.delete(id);
            }
        }

    } else {
        // No hands
        handDetected = false;
        status.textContent = 'Show entire palm...';
        handTracking.classList.remove('active');
        indicatorText.textContent = 'Waiting for input...';

        // Instant Remove
        handCircles.clear();
    }
}

// Animation Frame
function animate() {
    magicCtx.clearRect(0, 0, magicCanvas.width, magicCanvas.height);

    handCircles.forEach(disc => {
        disc.draw(magicCtx);
    });

    requestAnimationFrame(animate);
}

// Initialize
setupCamera().then(() => {
    // Initial Resize
    resizeCanvas();

    currentCamera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: 640,
        height: 480
    });
    currentCamera.start();

    status.textContent = 'System Ready';
});

// Start loop
animate();

// Camera toggle button functionality
cameraToggle.addEventListener('click', () => {
    if (cameraActive) {
        // Turn off camera
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        if (currentCamera) {
            currentCamera.stop();
        }
        video.srcObject = null;
        cameraActive = false;

        // Clear all visual elements
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        magicCtx.clearRect(0, 0, magicCanvas.width, magicCanvas.height);
        handCircles.clear();
        particles = [];

        // Update UI
        cameraToggle.classList.add('off');
        cameraIcon.textContent = '🚫';
        cameraText.textContent = 'Turn On Camera';
        status.textContent = 'Camera is off';
        handTracking.classList.remove('active');
        indicatorText.textContent = 'Camera Disabled';
    } else {
        // Turn on camera
        cameraToggle.classList.remove('off');
        cameraIcon.textContent = '📷';
        cameraText.textContent = 'Turn Off Camera';
        status.textContent = 'Initializing camera...';
        indicatorText.textContent = 'Starting...';

        setupCamera().then(() => {
            currentCamera = new Camera(video, {
                onFrame: async () => {
                    await hands.send({ image: video });
                },
                width: 640,
                height: 480
            });
            currentCamera.start();

            status.textContent = 'Ready! Show your palm!';
            indicatorText.textContent = 'No Hands Detected';
        });
    }
});
