document.addEventListener('DOMContentLoaded', () => {
    // --- Theme Management ---
    const themeToggle = document.getElementById('checkbox');
    const themeLabel = document.getElementById('theme-label');
    const currentTheme = localStorage.getItem('theme') ? localStorage.getItem('theme') : null;

    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark') {
            themeToggle.checked = true;
            themeLabel.textContent = 'Dark Mode';
        }
    }

    themeToggle.addEventListener('change', function(e) {
        if (e.target.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeLabel.textContent = 'Dark Mode';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            themeLabel.textContent = 'Light Mode';
        }
    });

    // --- State ---
    let filesData = []; // { id, file, originalUrl, imgObj, optimizedBlob, status }
    let isBatchMode = false;
    let originalFirstImageAspectRatio = null;
    let originalState = null;
    let debounceTimer = null;
    let lastEditedDimension = 'width';
    let cropperInstance = null;

    // --- DOM Elements ---
    const tabSingle = document.getElementById('tab-single');
    const tabBatch = document.getElementById('tab-batch');

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const dropZoneContent = document.getElementById('drop-zone-content');
    const uploadTitle = document.getElementById('upload-title');
    const uploadSubtitle = document.getElementById('upload-subtitle');
    const uploadStatus = document.getElementById('upload-status');
    const uploadCountText = document.getElementById('upload-count-text');
    
    const inputWidth = document.getElementById('input-width');
    const inputHeight = document.getElementById('input-height');
    const inputMinSize = document.getElementById('input-min-size');
    const inputMaxSize = document.getElementById('input-max-size');
    const selectFormat = document.getElementById('select-format');
    
    const maintainRatioGroup = document.getElementById('maintain-ratio-group');
    const maintainRatioCheckbox = document.getElementById('maintain-ratio');
    
    const aspectRatioGroup = document.getElementById('aspect-ratio-group');
    const selectAspectRatio = document.getElementById('select-aspect-ratio');
    
    const bgColorGroup = document.getElementById('bg-color-group');
    const inputBgColor = document.getElementById('input-bg-color');

    const processBtn = document.getElementById('process-btn');
    const undoBtn = document.getElementById('undo-btn');
    
    const resultsTitle = document.getElementById('results-title');
    const overallStatus = document.getElementById('overall-status');
    const downloadBtn = document.getElementById('download-btn');
    const downloadBtnText = document.getElementById('download-btn-text');
    const resultsGrid = document.getElementById('results-grid');

    const cropperContainer = document.getElementById('cropper-container');
    const cropperImage = document.getElementById('cropper-image');

    // --- UI State Management ---
    function setMode(batch) {
        isBatchMode = batch;
        if (batch) {
            tabBatch.classList.add('active');
            tabSingle.classList.remove('active');
            fileInput.multiple = true;
            fileInput.accept = "image/*,.heic,.heif";
            uploadTitle.textContent = "Upload Images";
            uploadSubtitle.textContent = "Drag & Drop or Click (Multiple allowed)";
            
            maintainRatioGroup.style.display = 'none';
            aspectRatioGroup.style.display = 'flex';
            if (selectAspectRatio.value === 'fit') bgColorGroup.style.display = 'flex';
            
            processBtn.classList.remove('hidden');
            undoBtn.classList.add('hidden');
            resultsTitle.textContent = "Batch Results";
            downloadBtnText.textContent = "Download ZIP";
        } else {
            tabSingle.classList.add('active');
            tabBatch.classList.remove('active');
            fileInput.multiple = false;
            fileInput.accept = "image/*,.heic,.heif";
            uploadTitle.textContent = "Upload Image";
            uploadSubtitle.textContent = "Drag & Drop or Click (Single file)";
            
            // In Single mode, show Aspect Ratio to allow 'Crop' mode
            maintainRatioGroup.style.display = selectAspectRatio.value === 'crop' ? 'none' : 'flex';
            aspectRatioGroup.style.display = 'flex';
            bgColorGroup.style.display = selectAspectRatio.value === 'fit' ? 'flex' : 'none';
            
            processBtn.classList.add('hidden');
            undoBtn.classList.remove('hidden');
            resultsTitle.textContent = "Live Preview";
            downloadBtnText.textContent = "Download";
        }
        
        // Clear files on mode switch
        filesData = [];
        updateUploadStatus();
        updateCropperUI();
        renderGrid();
        overallStatus.textContent = "Waiting for file...";
        overallStatus.className = "status-message";
        downloadBtn.classList.add('hidden');
    }

    tabSingle.addEventListener('click', () => setMode(false));
    tabBatch.addEventListener('click', () => setMode(true));

    function updateCropperUI() {
        if (!isBatchMode && filesData.length > 0 && selectAspectRatio.value === 'crop') {
            maintainRatioGroup.style.display = 'none';
            cropperContainer.classList.remove('hidden');
            
            if (!cropperInstance) {
                cropperImage.src = filesData[0].originalUrl;
                const targetW = parseInt(inputWidth.value, 10) || 1;
                const targetH = parseInt(inputHeight.value, 10) || 1;
                
                cropperInstance = new Cropper(cropperImage, {
                    aspectRatio: targetW / targetH,
                    viewMode: 1,
                    cropend: () => triggerLivePreview()
                });
            } else {
                const targetW = parseInt(inputWidth.value, 10) || 1;
                const targetH = parseInt(inputHeight.value, 10) || 1;
                cropperInstance.setAspectRatio(targetW / targetH);
            }
        } else {
            cropperContainer.classList.add('hidden');
            if (cropperInstance) {
                cropperInstance.destroy();
                cropperInstance = null;
            }
            if (!isBatchMode) {
                maintainRatioGroup.style.display = 'flex';
            }
        }
    }

    // --- Event Listeners ---
    selectAspectRatio.addEventListener('change', (e) => {
        bgColorGroup.style.display = e.target.value === 'fit' ? 'flex' : 'none';
        updateCropperUI();
        triggerLivePreview();
    });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFiles(e.target.files);
    });

    // Aspect Ratio Lock Logic (MS Paint Style)
    inputWidth.addEventListener('input', () => {
        lastEditedDimension = 'width';
        if (!isBatchMode && maintainRatioCheckbox.checked && selectAspectRatio.value !== 'crop' && originalFirstImageAspectRatio) {
            inputHeight.value = Math.round(inputWidth.value / originalFirstImageAspectRatio);
        }
        if (cropperInstance) cropperInstance.setAspectRatio((parseInt(inputWidth.value)||1) / (parseInt(inputHeight.value)||1));
        triggerLivePreview();
    });

    inputHeight.addEventListener('input', () => {
        lastEditedDimension = 'height';
        if (!isBatchMode && maintainRatioCheckbox.checked && selectAspectRatio.value !== 'crop' && originalFirstImageAspectRatio) {
            inputWidth.value = Math.round(inputHeight.value * originalFirstImageAspectRatio);
        }
        if (cropperInstance) cropperInstance.setAspectRatio((parseInt(inputWidth.value)||1) / (parseInt(inputHeight.value)||1));
        triggerLivePreview();
    });

    maintainRatioCheckbox.addEventListener('change', () => {
        if (!isBatchMode && maintainRatioCheckbox.checked && selectAspectRatio.value !== 'crop' && originalFirstImageAspectRatio) {
            if (lastEditedDimension === 'width') {
                inputHeight.value = Math.round(inputWidth.value / originalFirstImageAspectRatio);
            } else {
                inputWidth.value = Math.round(inputHeight.value * originalFirstImageAspectRatio);
            }
        }
        triggerLivePreview();
    });

    inputMinSize.addEventListener('input', () => {
        const minVal = parseFloat(inputMinSize.value) || 0;
        const maxVal = parseFloat(inputMaxSize.value) || 0;
        if (minVal > maxVal) inputMaxSize.value = minVal;
    });

    inputMaxSize.addEventListener('input', () => {
        const minVal = parseFloat(inputMinSize.value) || 0;
        const maxVal = parseFloat(inputMaxSize.value) || 0;
        if (maxVal < minVal && maxVal > 0) inputMinSize.value = maxVal;
    });

    // Realtime preview triggers
    [inputMinSize, inputMaxSize, selectFormat, inputBgColor].forEach(el => {
        el.addEventListener('input', triggerLivePreview);
        el.addEventListener('change', triggerLivePreview);
    });

    // Undo Logic
    undoBtn.addEventListener('click', () => {
        if (originalState) {
            inputWidth.value = originalState.w;
            inputHeight.value = originalState.h;
            inputMinSize.value = originalState.min;
            inputMaxSize.value = originalState.max;
            selectFormat.value = originalState.format;
            selectAspectRatio.value = "stretch";
            updateCropperUI();
            triggerLivePreview();
        }
    });

    // --- Handlers ---
    async function handleFiles(filesList) {
        const newFiles = Array.from(filesList).filter(file => file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif'));
        
        if (newFiles.length === 0) {
            alert('Please select valid image files.');
            return;
        }

        overallStatus.textContent = "Loading files...";
        overallStatus.className = "status-message warning";
        
        filesData = []; // Replace on new upload

        for (const file of newFiles) {
            let processFile = file;
            
            // HEIC/HEIF Conversion
            if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                overallStatus.textContent = `Converting HEIC: ${file.name}...`;
                try {
                    const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
                    // Handle array of blobs if heic has multiple images
                    const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                    processFile = new File([finalBlob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
                } catch (e) {
                    console.error("HEIC conversion failed", e);
                    continue;
                }
            }

            const url = URL.createObjectURL(processFile);
            const img = new Image();
            
            await new Promise((resolve) => {
                img.onload = resolve;
                img.src = url;
            });

            filesData.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                file: processFile,
                originalUrl: url,
                imgObj: img,
                optimizedBlob: null,
                status: 'pending' 
            });

            if (!isBatchMode) break; // Only take first file if single mode
        }

        if (filesData.length > 0) {
            const firstImg = filesData[0].imgObj;
            originalFirstImageAspectRatio = firstImg.width / firstImg.height;
            
            // Set initial state for Undo
            originalState = {
                w: firstImg.width,
                h: firstImg.height,
                min: 30,
                max: 50,
                format: 'image/jpeg'
            };

            if (!isBatchMode) {
                // Populate inputs with original dimensions in single mode
                inputWidth.value = firstImg.width;
                inputHeight.value = firstImg.height;
            }
        }

        updateUploadStatus();
        updateCropperUI();
        renderGrid();
        
        if (isBatchMode) {
            processBtn.disabled = false;
            downloadBtn.classList.add('hidden');
            overallStatus.textContent = "Ready to process";
            overallStatus.className = "status-message";
        } else {
            triggerLivePreview();
        }
    }

    function updateUploadStatus() {
        if (filesData.length > 0) {
            dropZoneContent.classList.add('hidden');
            uploadStatus.classList.remove('hidden');
            uploadCountText.textContent = `${filesData.length} file${filesData.length !== 1 ? 's' : ''} selected`;
        } else {
            dropZoneContent.classList.remove('hidden');
            uploadStatus.classList.add('hidden');
        }
    }

    function renderGrid() {
        resultsGrid.innerHTML = '';
        if (filesData.length === 0) {
            resultsGrid.innerHTML = '<div class="empty-state"><p>Processed images will appear here.</p></div>';
            return;
        }

        filesData.forEach(data => {
            let statusText = "Ready";
            let statusClass = "";
            let sizeText = formatBytes(data.file.size);
            let dimText = `${data.imgObj.width}x${data.imgObj.height}`;
            let previewUrl = data.originalUrl;

            if (data.status === 'processing') {
                statusText = "Processing...";
                statusClass = "warning";
            } else if (data.status === 'success') {
                statusText = "Done";
                statusClass = "success";
                sizeText = formatBytes(data.optimizedBlob.size);
                dimText = `${inputWidth.value}x${inputHeight.value}`;
                previewUrl = selectFormat.value === 'application/pdf' ? data.originalUrl : URL.createObjectURL(data.optimizedBlob); 
            }

            const card = document.createElement('div');
            card.className = 'result-item';
            card.id = `card-${data.id}`;
            
            card.innerHTML = `
                <div class="result-preview">
                    <img src="${previewUrl}" alt="Preview" />
                </div>
                <div class="result-info">
                    <div class="result-name" title="${data.file.name}">${data.file.name}</div>
                    <div class="result-stats">
                        <div class="stat-group">
                            <span class="stat-label">Size</span>
                            <span>${sizeText}</span>
                        </div>
                        <div class="stat-group">
                            <span class="stat-label">Dim</span>
                            <span>${dimText}</span>
                        </div>
                        <div class="stat-group item-status ${statusClass}">
                            <span class="stat-label">Status</span>
                            <span>${statusText}</span>
                        </div>
                    </div>
                </div>
            `;
            resultsGrid.appendChild(card);
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function getCanvasBlob(canvas, mimeType, quality) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), mimeType, quality);
        });
    }

    function blobToDataURL(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }

    // --- Processing ---
    function triggerLivePreview() {
        if (isBatchMode || filesData.length === 0) return;
        
        clearTimeout(debounceTimer);
        overallStatus.textContent = "Updating preview...";
        overallStatus.className = "status-message warning";
        
        debounceTimer = setTimeout(() => {
            processImages();
        }, 500);
    }

    processBtn.addEventListener('click', () => {
        if (isBatchMode) processImages();
    });

    async function processImages() {
        if (filesData.length === 0) return;

        const targetW = parseInt(inputWidth.value, 10);
        const targetH = parseInt(inputHeight.value, 10);
        const minKB = parseFloat(inputMinSize.value);
        const maxKB = parseFloat(inputMaxSize.value);
        
        const format = selectFormat.value; 
        const isPDF = format === 'application/pdf';
        const compressFormat = isPDF ? 'image/jpeg' : format;
        
        const aspectRatioMode = selectAspectRatio.value; 
        const bgColor = inputBgColor.value;

        if (!targetW || !targetH || !minKB || !maxKB) {
            if (isBatchMode) alert('Please fill out all target parameters.');
            return;
        }

        if (minKB > maxKB) {
            if (isBatchMode) alert('Min File Size must be less than or equal to Max File Size.');
            return;
        }

        const minBytes = minKB * 1024;
        const maxBytes = maxKB * 1024;

        if (isBatchMode) {
            processBtn.disabled = true;
            downloadBtn.classList.add('hidden');
        }

        for (let i = 0; i < filesData.length; i++) {
            const data = filesData[i];
            data.status = 'processing';
            
            if (isBatchMode) {
                overallStatus.textContent = `Processing ${i + 1} / ${filesData.length}...`;
                overallStatus.className = "status-message warning";
            }
            renderGrid(); 
            
            // Async yield for smooth UI
            await new Promise(r => setTimeout(r, 0));

            // Setup Canvas
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');

            // Draw Background if Fit mode or output is JPG/PDF
            if (aspectRatioMode === 'fit' || compressFormat === 'image/jpeg') {
                ctx.fillStyle = aspectRatioMode === 'fit' ? bgColor : '#FFFFFF';
                ctx.fillRect(0, 0, targetW, targetH);
            } else {
                ctx.clearRect(0, 0, targetW, targetH);
            }

            // Aspect Ratio Logic
            const imgW = data.imgObj.width;
            const imgH = data.imgObj.height;

            if (!isBatchMode && aspectRatioMode === 'crop' && cropperInstance) {
                const cropData = cropperInstance.getData();
                ctx.drawImage(data.imgObj, cropData.x, cropData.y, cropData.width, cropData.height, 0, 0, targetW, targetH);
            } else if (aspectRatioMode === 'stretch' || (aspectRatioMode === 'crop' && isBatchMode)) {
                // If batch mode and crop selected without cropper ui, fallback to center crop
                if (aspectRatioMode === 'crop') {
                    const scale = Math.max(targetW / imgW, targetH / imgH);
                    const sw = targetW / scale;
                    const sh = targetH / scale;
                    const sx = (imgW - sw) / 2;
                    const sy = (imgH - sh) / 2;
                    ctx.drawImage(data.imgObj, sx, sy, sw, sh, 0, 0, targetW, targetH);
                } else {
                    ctx.drawImage(data.imgObj, 0, 0, targetW, targetH);
                }
            } else if (aspectRatioMode === 'fit') {
                const scale = Math.min(targetW / imgW, targetH / imgH);
                const dw = imgW * scale;
                const dh = imgH * scale;
                const dx = (targetW - dw) / 2;
                const dy = (targetH - dh) / 2;
            }

            // Async yield before compression
            await new Promise(r => setTimeout(r, 0));

            // Compression Logic
            let bestBlob = null;

            if (compressFormat === 'image/png') {
                bestBlob = await getCanvasBlob(canvas, compressFormat, 1.0);
            } else {
                let minQ = 0.0;
                let maxQ = 1.0;

                for (let j = 0; j < 8; j++) {
                    let midQ = (minQ + maxQ) / 2;
                    let blob = await getCanvasBlob(canvas, compressFormat, midQ);
                    
                    if (blob.size <= maxBytes) {
                        bestBlob = blob;
                        minQ = midQ; 
                    } else {
                        maxQ = midQ; 
                    }
                    // Async yield to prevent freeze during intensive binary search
                    await new Promise(r => setTimeout(r, 0));
                }

                if (!bestBlob) {
                    bestBlob = await getCanvasBlob(canvas, compressFormat, 0.0);
                }
            }

            // PDF Wrapping
            if (isPDF) {
                const dataUrl = await blobToDataURL(bestBlob);
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({
                    orientation: targetW > targetH ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [targetW, targetH]
                });
                pdf.addImage(dataUrl, 'JPEG', 0, 0, targetW, targetH);
                bestBlob = pdf.output('blob');
                
                await new Promise(r => setTimeout(r, 0)); // yield
            }

            // Padding Logic (Min Size)
            if (bestBlob.size < minBytes) {
                const paddingSize = Math.ceil(minBytes - bestBlob.size);
                const padding = new Uint8Array(paddingSize);
                bestBlob = new Blob([bestBlob, padding], { type: format });
            }

            data.optimizedBlob = bestBlob;
            data.status = 'success';
        }

        overallStatus.textContent = isBatchMode ? "All images processed!" : "Preview updated!";
        overallStatus.className = "status-message success";
        if (isBatchMode) processBtn.disabled = false;
        downloadBtn.classList.remove('hidden');
        renderGrid(); 
    }

    // --- Download ---
    downloadBtn.addEventListener('click', async () => {
        const successfulFiles = filesData.filter(d => d.status === 'success');
        if (successfulFiles.length === 0) return;

        const formatExt = selectFormat.value.split('/')[1].replace('jpeg', 'jpg');
        const targetW = inputWidth.value;
        const targetH = inputHeight.value;

        if (successfulFiles.length === 1 || !isBatchMode) {
            // Single download
            const data = successfulFiles[0];
            const originalName = data.file.name.replace(/\.[^/.]+$/, "");
            const a = document.createElement('a');
            a.href = URL.createObjectURL(data.optimizedBlob);
            a.download = `${originalName}_${targetW}x${targetH}.${formatExt}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            // Zip Download
            const zip = new JSZip();
            const folder = zip.folder(`Optimized_Images_${targetW}x${targetH}`);

            successfulFiles.forEach(data => {
                const originalName = data.file.name.replace(/\.[^/.]+$/, "");
                const fileName = `${originalName}.${formatExt}`;
                folder.file(fileName, data.optimizedBlob);
            });

            downloadBtn.disabled = true;
            downloadBtnText.innerHTML = "Generating ZIP...";

            const content = await zip.generateAsync({ type: "blob" });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = `Batch_Optimized_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            downloadBtn.disabled = false;
            downloadBtnText.innerHTML = "Download ZIP";
        }
    });

    // Initialize UI
    setMode(false);
});
