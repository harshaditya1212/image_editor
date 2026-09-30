
"use strict";

// ============================================================
// 1. DOM ELEMENTS
// ============================================================

const canvas = document.getElementById("imageCanvas");
const ctx = canvas.getContext("2d", {
    willReadFrequently: true
});

const uploadInput = document.getElementById("uploadInput");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");
const dropPrompt = document.getElementById("dropPrompt");

const rotateCwBtn = document.getElementById("rotateCwBtn");
const rotateCcwBtn = document.getElementById("rotateCcwBtn");
const flipHBtn = document.getElementById("flipHBtn");
const flipVBtn = document.getElementById("flipVBtn");

const wrapper = document.querySelector(".canvas-wrapper");


// ============================================================
// 2. EDITOR STATE
// ============================================================

let currentImg = null;

let rotation = 0;
let flipH = 1;
let flipV = 1;

// Maximum dimension used for interactive preview.
// Downloads are rendered at full resolution.

const PREVIEW_MAX_SIZE = 1400;

let renderRequested = false;


// ============================================================
// 3. SLIDERS
// ============================================================

const sliders = {
    perspX: document.getElementById("perspX"),
    perspY: document.getElementById("perspY"),

    brightness: document.getElementById("brightness"),
    contrast: document.getElementById("contrast"),
    saturation: document.getElementById("saturation"),
    grayscale: document.getElementById("grayscale"),
    sepia: document.getElementById("sepia"),
    hueRotate: document.getElementById("hueRotate"),
    blur: document.getElementById("blur"),

    hdr: document.getElementById("hdr"),
    sharpen: document.getElementById("sharpen"),
    vibrance: document.getElementById("vibrance"),
    vignette: document.getElementById("vignette")
};


const defaults = {
    perspX: 0,
    perspY: 0,

    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    hueRotate: 0,
    blur: 0,

    hdr: 0,
    sharpen: 0,
    vibrance: 0,
    vignette: 0
};


// ============================================================
// 4. UPDATE SLIDER LABELS
// ============================================================

function updateSliderLabel(key) {

    const label = document.getElementById(key + "Val");

    const value = sliders[key].value;

    if (
        key === "perspX" ||
        key === "perspY" ||
        key === "hueRotate"
    ) {
        label.textContent = value + "°";

    } else if (key === "blur") {

        label.textContent = value + "px";

    } else {

        label.textContent = value + "%";
    }
}


// ============================================================
// 5. CSS FILTERS
// ============================================================

function getFilterString() {

    return `
        brightness(${sliders.brightness.value}%)
        contrast(${sliders.contrast.value}%)
        saturate(${sliders.saturation.value}%)
        grayscale(${sliders.grayscale.value}%)
        sepia(${sliders.sepia.value}%)
        hue-rotate(${sliders.hueRotate.value}deg)
        blur(${sliders.blur.value}px)
    `.trim();
}


// ============================================================
// 6. HELPER FUNCTIONS
// ============================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


function createCanvas(width, height) {

    const c = document.createElement("canvas");

    c.width = Math.max(1, Math.ceil(width));
    c.height = Math.max(1, Math.ceil(height));

    return c;
}


// ============================================================
// 7. ROTATION + FLIP + BASIC FILTERS
// ============================================================

function createBaseCanvas(maxSize = Infinity) {

    const originalW = currentImg.naturalWidth;
    const originalH = currentImg.naturalHeight;

    const scale = Math.min(
        1,
        maxSize / Math.max(originalW, originalH)
    );

    const imageW = Math.max(
        1,
        Math.round(originalW * scale)
    );

    const imageH = Math.max(
        1,
        Math.round(originalH * scale)
    );

    const sideways =
        rotation === 90 ||
        rotation === 270;

    const width = sideways ? imageH : imageW;
    const height = sideways ? imageW : imageH;

    const offscreen = createCanvas(width, height);

    const offCtx = offscreen.getContext("2d");

    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "high";

    offCtx.save();

    offCtx.translate(
        width / 2,
        height / 2
    );

    offCtx.rotate(
        rotation * Math.PI / 180
    );

    offCtx.scale(flipH, flipV);

    offCtx.filter = getFilterString();

    offCtx.drawImage(
        currentImg,
        -imageW / 2,
        -imageH / 2,
        imageW,
        imageH
    );

    offCtx.restore();

    return offscreen;
}


// ============================================================
// 8. 3D PERSPECTIVE PROJECTION
// ============================================================
//
// This is the core of the updated perspective implementation.
//
// Instead of resizing rows or columns, we treat the image
// as a rectangular plane in 3D space.
//
// Perspective X rotates around the vertical Y axis.
// Perspective Y rotates around the horizontal X axis.
//
// Each point is projected onto a virtual camera plane.
//
// Projection:
//
//     projectedX = x * focal / (focal - z)
//     projectedY = y * focal / (focal - z)
//
// Points closer to the camera appear larger.
// Points farther from the camera appear smaller.
//
// ============================================================

function calculatePerspectiveCorners(
    width,
    height,
    perspectiveX,
    perspectiveY
) {

    const angleY =
        perspectiveX * Math.PI / 180;

    const angleX =
        -perspectiveY * Math.PI / 180;

    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);

    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);

    const halfW = width / 2;
    const halfH = height / 2;

    // Camera distance determines perspective strength.
    //
    // Smaller focal distance = stronger perspective.
    // Larger focal distance = subtler perspective.

    const focal =
        Math.max(width, height) * 1.15;

    const corners = [

        { x: -halfW, y: -halfH, z: 0 },
        { x:  halfW, y: -halfH, z: 0 },
        { x:  halfW, y:  halfH, z: 0 },
        { x: -halfW, y:  halfH, z: 0 }

    ];

    return corners.map(point => {

        // ---------------------------------------------
        // Rotate around vertical Y axis.
        // ---------------------------------------------

        const x1 =
            point.x * cosY +
            point.z * sinY;

        const z1 =
            -point.x * sinY +
            point.z * cosY;

        // ---------------------------------------------
        // Rotate around horizontal X axis.
        // ---------------------------------------------

        const y2 =
            point.y * cosX -
            z1 * sinX;

        const z2 =
            point.y * sinX +
            z1 * cosX;

        // ---------------------------------------------
        // Perspective projection.
        // ---------------------------------------------

        const denominator =
            focal - z2;

        const scale =
            focal / denominator;

        return {
            x: x1 * scale,
            y: y2 * scale
        };
    });
}


// ============================================================
// 9. SOLVE LINEAR EQUATIONS
// ============================================================
//
// Gaussian elimination with partial pivoting.
//
// Used to calculate a projective homography.
//
// ============================================================

function solveLinearSystem(matrix, values) {

    const n = values.length;

    const a = matrix.map((row, i) => [
        ...row,
        values[i]
    ]);

    for (let col = 0; col < n; col++) {

        // Find strongest pivot.

        let pivot = col;

        for (let row = col + 1; row < n; row++) {

            if (
                Math.abs(a[row][col]) >
                Math.abs(a[pivot][col])
            ) {
                pivot = row;
            }
        }

        if (Math.abs(a[pivot][col]) < 1e-12) {
            throw new Error(
                "Perspective transformation is degenerate."
            );
        }

        // Swap rows.

        [a[col], a[pivot]] =
            [a[pivot], a[col]];

        // Normalize pivot row.

        const divisor = a[col][col];

        for (let j = col; j <= n; j++) {
            a[col][j] /= divisor;
        }

        // Eliminate remaining rows.

        for (let row = 0; row < n; row++) {

            if (row === col) continue;

            const factor = a[row][col];

            for (let j = col; j <= n; j++) {

                a[row][j] -=
                    factor * a[col][j];
            }
        }
    }

    return a.map(row => row[n]);
}


// ============================================================
// 10. CALCULATE HOMOGRAPHY
// ============================================================
//
// A homography maps:
//
//     (x, y) -> (u, v)
//
// using:
//
//     u = (h0*x + h1*y + h2) / denominator
//     v = (h3*x + h4*y + h5) / denominator
//
//     denominator = h6*x + h7*y + 1
//
// Unlike bilinear interpolation, this represents an actual
// projective transformation.
//
// ============================================================

function calculateHomography(source, destination) {

    const matrix = [];
    const values = [];

    for (let i = 0; i < 4; i++) {

        const x = source[i].x;
        const y = source[i].y;

        const u = destination[i].x;
        const v = destination[i].y;

        matrix.push([
            x, y, 1,
            0, 0, 0,
            -u * x,
            -u * y
        ]);

        values.push(u);

        matrix.push([
            0, 0, 0,
            x, y, 1,
            -v * x,
            -v * y
        ]);

        values.push(v);
    }

    return solveLinearSystem(matrix, values);
}


// ============================================================
// 11. BILINEAR PIXEL SAMPLING
// ============================================================
//
// This samples pixels at fractional coordinates.
//
// It interpolates between the four nearest source pixels.
//
// Alpha is interpolated in premultiplied form to avoid
// dark fringes along transparent edges.
//
// ============================================================

function sampleBilinear(
    sourceData,
    width,
    height,
    x,
    y,
    destinationData,
    destinationIndex
) {

    if (
        x < 0 ||
        y < 0 ||
        x > width - 1 ||
        y > height - 1
    ) {
        return;
    }

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);

    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const dx = x - x0;
    const dy = y - y0;

    const i00 = (y0 * width + x0) * 4;
    const i10 = (y0 * width + x1) * 4;
    const i01 = (y1 * width + x0) * 4;
    const i11 = (y1 * width + x1) * 4;

    const w00 = (1 - dx) * (1 - dy);
    const w10 = dx * (1 - dy);
    const w01 = (1 - dx) * dy;
    const w11 = dx * dy;

    const a00 = sourceData[i00 + 3] / 255;
    const a10 = sourceData[i10 + 3] / 255;
    const a01 = sourceData[i01 + 3] / 255;
    const a11 = sourceData[i11 + 3] / 255;

    const wa00 = w00 * a00;
    const wa10 = w10 * a10;
    const wa01 = w01 * a01;
    const wa11 = w11 * a11;

    const alpha =
        wa00 + wa10 + wa01 + wa11;

    if (alpha <= 0) return;

    for (let channel = 0; channel < 3; channel++) {

        destinationData[destinationIndex + channel] =

            (
                sourceData[i00 + channel] * wa00 +
                sourceData[i10 + channel] * wa10 +
                sourceData[i01 + channel] * wa01 +
                sourceData[i11 + channel] * wa11
            ) / alpha;
    }

    destinationData[destinationIndex + 3] =
        alpha * 255;
}


// ============================================================
// 12. POINT INSIDE QUADRILATERAL
// ============================================================
//
// Prevents drawing pixels outside the transformed image.
//
// The destination quadrilateral is convex.
//
// ============================================================

function pointInsideQuad(x, y, quad) {

    let positive = false;
    let negative = false;

    for (let i = 0; i < 4; i++) {

        const a = quad[i];
        const b = quad[(i + 1) % 4];

        const cross =
            (b.x - a.x) * (y - a.y) -
            (b.y - a.y) * (x - a.x);

        if (cross > 0) positive = true;
        if (cross < 0) negative = true;

        if (positive && negative) {
            return false;
        }
    }

    return true;
}


// ============================================================
// 13. APPLY TRUE PERSPECTIVE
// ============================================================
//
// Workflow:
//
// 1. Calculate projected 3D corners.
// 2. Determine complete output bounding box.
// 3. Translate projected corners into output canvas.
// 4. Calculate inverse homography.
// 5. Map destination pixels back to source pixels.
// 6. Sample using bilinear interpolation.
//
// The inverse mapping avoids holes in the transformed image.
//
// ============================================================

function applyPerspective(
    sourceCanvas,
    perspectiveX,
    perspectiveY
) {

    if (
        perspectiveX === 0 &&
        perspectiveY === 0
    ) {
        return sourceCanvas;
    }

    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;

    // ---------------------------------------------
    // Project original corners.
    // ---------------------------------------------

    const projected =
        calculatePerspectiveCorners(
            srcW,
            srcH,
            perspectiveX,
            perspectiveY
        );

    // ---------------------------------------------
    // Determine bounding box.
    // ---------------------------------------------

    const minX = Math.min(
        ...projected.map(p => p.x)
    );

    const maxX = Math.max(
        ...projected.map(p => p.x)
    );

    const minY = Math.min(
        ...projected.map(p => p.y)
    );

    const maxY = Math.max(
        ...projected.map(p => p.y)
    );

    // Small transparent margin to preserve edges.

    const padding = 2;

    const outputWidth =
        Math.ceil(maxX - minX) + padding * 2;

    const outputHeight =
        Math.ceil(maxY - minY) + padding * 2;

    const output =
        createCanvas(
            outputWidth,
            outputHeight
        );

    const outCtx = output.getContext("2d");

    // ---------------------------------------------
    // Translate quadrilateral into canvas.
    // ---------------------------------------------

    const destination =
        projected.map(p => ({
            x: p.x - minX + padding,
            y: p.y - minY + padding
        }));

    // ---------------------------------------------
    // Source rectangle.
    // ---------------------------------------------

    const source = [

        { x: 0, y: 0 },

        { x: srcW - 1, y: 0 },

        { x: srcW - 1, y: srcH - 1 },

        { x: 0, y: srcH - 1 }

    ];

    // ---------------------------------------------
    // Calculate inverse homography.
    //
    // Destination -> Source
    // ---------------------------------------------

    const H =
        calculateHomography(
            destination,
            source
        );

    // ---------------------------------------------
    // Read source pixels.
    // ---------------------------------------------

    const sourceCtx =
        sourceCanvas.getContext("2d", {
            willReadFrequently: true
        });

    const sourceImageData =
        sourceCtx.getImageData(
            0,
            0,
            srcW,
            srcH
        );

    const srcData = sourceImageData.data;

    // ---------------------------------------------
    // Create destination pixel buffer.
    // ---------------------------------------------

    const outputImageData =
        outCtx.createImageData(
            outputWidth,
            outputHeight
        );

    const dstData = outputImageData.data;

    // ---------------------------------------------
    // Inverse perspective mapping.
    // ---------------------------------------------

    for (let y = 0; y < outputHeight; y++) {

        for (let x = 0; x < outputWidth; x++) {

            if (
                !pointInsideQuad(
                    x,
                    y,
                    destination
                )
            ) {
                continue;
            }

            const denominator =
                H[6] * x +
                H[7] * y +
                1;

            if (
                Math.abs(denominator) < 1e-10
            ) {
                continue;
            }

            // Map destination pixel back to
            // original image coordinates.

            const sourceX =
                (
                    H[0] * x +
                    H[1] * y +
                    H[2]
                ) / denominator;

            const sourceY =
                (
                    H[3] * x +
                    H[4] * y +
                    H[5]
                ) / denominator;

            const destinationIndex =
                (y * outputWidth + x) * 4;

            sampleBilinear(
                srcData,
                srcW,
                srcH,
                sourceX,
                sourceY,
                dstData,
                destinationIndex
            );
        }
    }

    // ---------------------------------------------
    // Write transformed pixels.
    // ---------------------------------------------

    outCtx.putImageData(
        outputImageData,
        0,
        0
    );

    return output;
}


// ============================================================
// 14. HDR EFFECT
// ============================================================

function applyHDR(data, amount) {

    if (amount <= 0) return;

    const factor = amount / 100;

    for (let i = 0; i < data.length; i += 4) {

        if (data[i + 3] === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const luminance =
            0.299 * r +
            0.587 * g +
            0.114 * b;

        const boost =
            Math.sin(
                luminance / 255 * Math.PI
            ) * 70 * factor;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);

        const saturationFactor =
            (
                1 - (max - min) / 255
            ) * 0.4 * factor;

        const br = r + boost;
        const bg = g + boost;
        const bb = b + boost;

        data[i] = clamp(
            br + (br - luminance) * saturationFactor,
            0,
            255
        );

        data[i + 1] = clamp(
            bg + (bg - luminance) * saturationFactor,
            0,
            255
        );

        data[i + 2] = clamp(
            bb + (bb - luminance) * saturationFactor,
            0,
            255
        );
    }
}


// ============================================================
// 15. VIBRANCE
// ============================================================

function applyVibrance(data, amount) {

    if (amount === 0) return;

    const factor = amount / 100;

    for (let i = 0; i < data.length; i += 4) {

        if (data[i + 3] === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const max = Math.max(r, g, b);
        const avg = (r + g + b) / 3;

        const saturation =
            (max - Math.min(r, g, b)) / 255;

        // Positive vibrance primarily boosts
        // less-saturated colors.

        if (factor > 0) {

            const strength =
                factor * (1 - saturation) * 0.8;

            data[i] = clamp(
                r + (r - avg) * strength,
                0,
                255
            );

            data[i + 1] = clamp(
                g + (g - avg) * strength,
                0,
                255
            );

            data[i + 2] = clamp(
                b + (b - avg) * strength,
                0,
                255
            );

        } else {

            const strength = -factor;

            data[i] =
                r + (avg - r) * strength;

            data[i + 1] =
                g + (avg - g) * strength;

            data[i + 2] =
                b + (avg - b) * strength;
        }
    }
}


// ============================================================
// 16. SHARPEN
// ============================================================

function applySharpen(
    targetCtx,
    width,
    height,
    amount
) {

    if (amount <= 0) return;

    const strength =
        amount / 100 * 1.5;

    const weights = [

        0, -strength, 0,

        -strength,
        1 + 4 * strength,
        -strength,

        0, -strength, 0

    ];

    const input =
        targetCtx.getImageData(
            0,
            0,
            width,
            height
        );

    const src = input.data;

    const output =
        targetCtx.createImageData(
            width,
            height
        );

    const dst = output.data;

    // Preserve the original border.

    dst.set(src);

    for (let y = 1; y < height - 1; y++) {

        for (let x = 1; x < width - 1; x++) {

            const index =
                (y * width + x) * 4;

            // Avoid sharpening transparent boundaries.

            if (src[index + 3] !== 255) {
                continue;
            }

            let fullyOpaque = true;

            for (let cy = -1; cy <= 1; cy++) {

                for (let cx = -1; cx <= 1; cx++) {

                    const neighbor =
                        (
                            (y + cy) * width +
                            (x + cx)
                        ) * 4;

                    if (src[neighbor + 3] !== 255) {
                        fullyOpaque = false;
                    }
                }
            }

            if (!fullyOpaque) continue;

            for (let channel = 0; channel < 3; channel++) {

                let sum = 0;

                for (let cy = -1; cy <= 1; cy++) {

                    for (let cx = -1; cx <= 1; cx++) {

                        const sourceIndex =
                            (
                                (y + cy) * width +
                                (x + cx)
                            ) * 4 + channel;

                        const weight =
                            weights[
                                (cy + 1) * 3 +
                                (cx + 1)
                            ];

                        sum +=
                            src[sourceIndex] * weight;
                    }
                }

                dst[index + channel] =
                    clamp(sum, 0, 255);
            }
        }
    }

    targetCtx.putImageData(
        output,
        0,
        0
    );
}


// ============================================================
// 17. VIGNETTE
// ============================================================

function applyVignette(
    targetCtx,
    width,
    height,
    amount
) {

    if (amount <= 0) return;

    const radius =
        Math.max(width, height) / 1.5;

    const gradient =
        targetCtx.createRadialGradient(

            width / 2,
            height / 2,
            radius * 0.4,

            width / 2,
            height / 2,
            radius
        );

    gradient.addColorStop(
        0,
        "rgba(0,0,0,0)"
    );

    gradient.addColorStop(
        1,
        `rgba(0,0,0,${amount / 100 * 0.85})`
    );

    targetCtx.save();

    // Darken existing pixels without adding an opaque
    // background outside the transformed image.

    targetCtx.globalCompositeOperation =
        "source-atop";

    targetCtx.fillStyle = gradient;

    targetCtx.fillRect(
        0,
        0,
        width,
        height
    );

    targetCtx.restore();
}


// ============================================================
// 18. COMPLETE RENDER PIPELINE
// ============================================================

function buildEditedCanvas(maxSize = Infinity) {

    if (!currentImg) return null;

    // ---------------------------------------------
    // Pass 1: Base transformations.
    // ---------------------------------------------

    const baseCanvas =
        createBaseCanvas(maxSize);

    // ---------------------------------------------
    // Pass 2: Perspective.
    // ---------------------------------------------

    const perspectiveX =
        Number(sliders.perspX.value);

    const perspectiveY =
        Number(sliders.perspY.value);

    const warpedCanvas =
        applyPerspective(
            baseCanvas,
            perspectiveX,
            perspectiveY
        );

    // ---------------------------------------------
    // Pass 3: Final output.
    // ---------------------------------------------

    const output =
        createCanvas(
            warpedCanvas.width,
            warpedCanvas.height
        );

    const outputCtx =
        output.getContext("2d", {
            willReadFrequently: true
        });

    outputCtx.drawImage(
        warpedCanvas,
        0,
        0
    );

    // ---------------------------------------------
    // Pass 4: HDR and vibrance.
    // ---------------------------------------------

    const hdr =
        Number(sliders.hdr.value);

    const vibrance =
        Number(sliders.vibrance.value);

    if (
        hdr !== 0 ||
        vibrance !== 0
    ) {

        const imageData =
            outputCtx.getImageData(
                0,
                0,
                output.width,
                output.height
            );

        applyHDR(
            imageData.data,
            hdr
        );

        applyVibrance(
            imageData.data,
            vibrance
        );

        outputCtx.putImageData(
            imageData,
            0,
            0
        );
    }

    // ---------------------------------------------
    // Pass 5: Sharpen.
    // ---------------------------------------------

    applySharpen(
        outputCtx,
        output.width,
        output.height,
        Number(sliders.sharpen.value)
    );

    // ---------------------------------------------
    // Pass 6: Vignette.
    // ---------------------------------------------

    applyVignette(
        outputCtx,
        output.width,
        output.height,
        Number(sliders.vignette.value)
    );

    return output;
}


// ============================================================
// 19. RENDER PREVIEW
// ============================================================

function renderImage() {

    if (!currentImg) return;

    const edited =
        buildEditedCanvas(PREVIEW_MAX_SIZE);

    if (!edited) return;

    canvas.width = edited.width;
    canvas.height = edited.height;

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.drawImage(
        edited,
        0,
        0
    );
}


// ============================================================
// 20. REQUEST RENDER
// ============================================================
//
// Coalesces multiple slider events into a single frame.
//
// ============================================================

function requestRender() {

    if (renderRequested) return;

    renderRequested = true;

    requestAnimationFrame(() => {

        renderRequested = false;

        renderImage();
    });
}


// ============================================================
// 21. LOAD IMAGE
// ============================================================

function loadImage(file) {

    if (
        !file ||
        !file.type.startsWith("image/")
    ) {
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {

        const img = new Image();

        img.onload = () => {

            currentImg = img;

            // Reset orientation for the newly loaded image.

            rotation = 0;
            flipH = 1;
            flipV = 1;

            // Reset sliders.

            Object.keys(sliders).forEach(key => {

                sliders[key].value =
                    defaults[key];

                updateSliderLabel(key);
            });

            dropPrompt.style.display = "none";

            downloadBtn.disabled = false;
            resetBtn.disabled = false;

            rotateCwBtn.disabled = false;
            rotateCcwBtn.disabled = false;

            flipHBtn.disabled = false;
            flipVBtn.disabled = false;

            requestRender();
        };

        img.onerror = () => {
            alert("Unable to load this image.");
        };

        img.src = event.target.result;
    };

    reader.readAsDataURL(file);
}


// ============================================================
// 22. ROTATE CLOCKWISE
// ============================================================

rotateCwBtn.addEventListener("click", () => {

    rotation =
        (rotation + 90) % 360;

    requestRender();
});


// ============================================================
// 23. ROTATE COUNTERCLOCKWISE
// ============================================================

rotateCcwBtn.addEventListener("click", () => {

    rotation =
        (rotation - 90 + 360) % 360;

    requestRender();
});


// ============================================================
// 24. HORIZONTAL FLIP
// ============================================================

flipHBtn.addEventListener("click", () => {

    flipH *= -1;

    requestRender();
});


// ============================================================
// 25. VERTICAL FLIP
// ============================================================

flipVBtn.addEventListener("click", () => {

    flipV *= -1;

    requestRender();
});


// ============================================================
// 26. SLIDER EVENTS
// ============================================================

Object.keys(sliders).forEach(key => {

    sliders[key].addEventListener("input", () => {

        updateSliderLabel(key);

        requestRender();
    });
});


// ============================================================
// 27. UPLOAD IMAGE
// ============================================================

uploadInput.addEventListener("change", event => {

    const file = event.target.files[0];

    if (file) {
        loadImage(file);
    }

    // Allow selecting the same file again.

    uploadInput.value = "";
});


// ============================================================
// 28. RESET ALL
// ============================================================

resetBtn.addEventListener("click", () => {

    if (!currentImg) return;

    rotation = 0;
    flipH = 1;
    flipV = 1;

    Object.keys(sliders).forEach(key => {

        sliders[key].value =
            defaults[key];

        updateSliderLabel(key);
    });

    requestRender();
});


// ============================================================
// 29. DOWNLOAD FULL-RESOLUTION IMAGE
// ============================================================

downloadBtn.addEventListener("click", async () => {

    if (!currentImg) return;

    downloadBtn.disabled = true;
    downloadBtn.textContent = "Processing...";

    // Allow the browser to update the button before
    // starting the full-resolution render.

    await new Promise(resolve => {
        requestAnimationFrame(resolve);
    });

    try {

        // Infinity means no preview downscaling.

        const fullResolution =
            buildEditedCanvas(Infinity);

        const blob = await new Promise(resolve => {

            fullResolution.toBlob(
                resolve,
                "image/png"
            );
        });

        if (!blob) {
            throw new Error(
                "Unable to encode the edited image."
            );
        }

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.download = "edited-photo.png";
        link.href = url;

        document.body.appendChild(link);

        link.click();

        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

    } catch (error) {

        console.error(
            "Image download failed:",
            error
        );

        alert(
            "Unable to export the image. " +
            "Try using a smaller image."
        );

    } finally {

        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download";
    }
});


// ============================================================
// 30. DRAG AND DROP
// ============================================================

wrapper.addEventListener("dragover", event => {

    event.preventDefault();

    event.dataTransfer.dropEffect = "copy";
});


wrapper.addEventListener("drop", event => {

    event.preventDefault();

    const file =
        event.dataTransfer.files[0];

    if (file) {
        loadImage(file);
    }
});


// ============================================================
// 31. INITIALIZE LABELS
// ============================================================

Object.keys(sliders).forEach(key => {
    updateSliderLabel(key);
});