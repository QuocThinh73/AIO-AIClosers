// ===================================================================
// SEARCH.JS - Module for handling search and displaying results
// ===================================================================

window.SearchModule = (function() {
    'use strict';
    
    // Private variables
    let isSearching = false;
    let currentController = null;
    
    // Private methods
    
    function getSelectedModels() {
        return Array.from(document.querySelectorAll('input[name="models"]:checked'))
                   .map(checkbox => checkbox.value);
    }
    
    function buildSearchFormData(query, ocrText, selectedModels, selectedObjects, topK, uploadedFile) {
        const formData = new FormData();
        
        if (query) formData.append('query', query);
        if (ocrText) formData.append('ocr_text', ocrText);
        formData.append('models', JSON.stringify(selectedModels));
        if (selectedObjects.length > 0) {
            formData.append('objects', JSON.stringify(selectedObjects));
        }
        formData.append('topK', topK.toString());
        if (uploadedFile) {
            formData.append('file', uploadedFile);
        }
        
        return formData;
    }
    
    function setSearchingState(searching) {
        isSearching = searching;
        if (searching) {
            // Clear results when starting new search
            window.AppElements.resultsDiv.innerHTML = '';
        }
    }
    
    function handleSearchError(error) {
        let errorMessage = error.message || 'An error occurred during search';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Search request timed out (30s). Please try again.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to server. Please check your network connection and try again.';
        }
        
        window.AppElements.resultsDiv.innerHTML = `
            <div class="error" style="color: #721c24; padding: 15px; margin: 15px 0; border: 1px solid #f5c6cb; background-color: #f8d7da; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 1.2em;"></i>
                    <h3 style="margin: 0; font-size: 1.1em;">Search Error</h3>
                </div>
                <div style="background: white; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; word-break: break-word;">
                    ${errorMessage}
                </div>
                <p style="margin-top: 10px; margin-bottom: 0; font-size: 0.9em;">
                    Please try again or contact the administrator if the error persists.
                </p>
            </div>
        `;
    }
    
    // Image upload handling
    function handleImageUpload() {
        const fileInput = document.getElementById('imageUpload');
        const uploadBtn = document.getElementById('imageUploadBtn');
        const preview = document.getElementById('uploadedImagePreview');
        const previewImg = document.getElementById('previewImage');
        const removeBtn = document.getElementById('removeImageBtn');
        const searchInput = window.AppElements.searchInput;
        
        if (fileInput && uploadBtn && preview && previewImg && removeBtn) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        previewImg.src = e.target.result;
                        preview.style.display = 'block';
                        // Clear text input when image is selected
                        searchInput.value = '';
                        searchInput.placeholder = 'Tìm kiếm bằng ảnh đã chọn...';
                    };
                    reader.readAsDataURL(file);
                }
            });
            
            removeBtn.addEventListener('click', () => {
                fileInput.value = '';
                preview.style.display = 'none';
                previewImg.src = '';
                searchInput.placeholder = 'Nhập mô tả ảnh bạn muốn tìm...';
            });
        }
    }
    
    function validateSearchInputWithImage(query, ocrText, uploadedFile, selectedModels, topK) {
        // Check if at least query, OCR text, or image is provided
        if (!query && !ocrText && !uploadedFile) {
            alert('Please enter search text or upload an image');
            return false;
        }
        
        // Check if TopK is valid
        if (isNaN(topK) || topK < 1) {
            alert('Invalid Top K value');
            return false;
        }
        
        // Check if at least one model is selected
        if (selectedModels.length === 0) {
            alert('Please select at least one model');
            return false;
        }
        
        return true;
    }
    


    // Public methods
    function handleSearch(e) {
        e.preventDefault();
        
        if (isSearching) return;
        
        // Get data from form
        const query = window.AppElements.searchInput.value.trim();
        const ocrText = window.AppElements.ocrInput ? window.AppElements.ocrInput.value.trim() : '';
        const selectedModels = getSelectedModels();
        const selectedObjects = window.AppData.selectedObjects;
        const topK = window.AppElements.topKInput ? parseInt(window.AppElements.topKInput.value) : 100;
        
        // Check for uploaded image
        const fileInput = document.getElementById('imageUpload');
        const uploadedFile = fileInput && fileInput.files[0];
        
        // Validate input
        if (!validateSearchInputWithImage(query, ocrText, uploadedFile, selectedModels, topK)) {
            return;
        }
        
        // Set searching state
        setSearchingState(true);
        
        // Cancel previous request if exists
        if (currentController) {
            currentController.abort();
        }
        
        // Create new controller
        currentController = new AbortController();
        const timeoutId = setTimeout(() => currentController.abort(), 30000);
        
        // Always POST with FormData - simple and consistent
        const fetchUrl = '/api/search';
        const fetchOptions = {
            method: 'POST',
            body: buildSearchFormData(query, ocrText, selectedModels, selectedObjects, topK, uploadedFile),
            signal: currentController.signal
        };
        const searchParams = { 
            query, 
            ocrText, 
            selectedObjects, 
            imageSearch: !!uploadedFile 
        };
        
        // Send unified POST request to /api/search
        fetch(fetchUrl, fetchOptions)
        .then(async response => {
            clearTimeout(timeoutId);
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`Server returned unknown error (${response.status}): ${text.substring(0, 200)}`);
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                const errorMessage = data.error || data.detail || data.message || `HTTP Error: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            return data;
        })
        .then(data => {
            displayResults(data, searchParams);
        })
        .catch(error => {
            if (error.name !== 'AbortError') {
                handleSearchError(error);
            }
        })
        .finally(() => {
            setSearchingState(false);
            currentController = null;
        });
    }
    
    function displayResults(data, searchParams = {}) {
        if (!data || !data.paths || data.paths.length === 0) {
            displayNoResults(searchParams);
            return;
        }
        
        const html = buildResultsHTML(data, searchParams);
        window.AppElements.resultsDiv.innerHTML = html;
    }
    
    function displayNoResults(searchParams) {
        const queryInfo = [];
        if (searchParams.imageSearch) {
            queryInfo.push('uploaded image');
        } else {
            if (searchParams.query) queryInfo.push(`"${searchParams.query}"`);
            if (searchParams.ocrText) queryInfo.push(`OCR: "${searchParams.ocrText}"`);
        }
        if (searchParams.selectedObjects && searchParams.selectedObjects.length > 0) {
            queryInfo.push(`Objects: ${searchParams.selectedObjects.join(', ')}`);
        }
        
        const searchType = searchParams.imageSearch ? 'image search' : 'search keywords';
        const iconClass = searchParams.imageSearch ? 'fas fa-image' : 'fas fa-search';
        
        window.AppElements.resultsDiv.innerHTML = `
            <div class="no-results" style="text-align: center; padding: 20px; color: #666;">
                <i class="${iconClass}" style="font-size: 2em; margin-bottom: 10px; opacity: 0.5;"></i>
                <p>No results found matching ${queryInfo.join(' + ') || searchType}</p>
                ${searchParams.selectedObjects && searchParams.selectedObjects.length > 0 ? 
                    `<p style="font-size: 0.9em; color: #999;">Filtered by objects: ${searchParams.selectedObjects.join(', ')}</p>` : ''
                }
            </div>
        `;
    }
    
    function buildResultsHTML(data, searchParams) {
        let html = `
            <div class="image-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px;">
        `;
        
        data.paths.forEach((path, index) => {
            const score = data.scores && data.scores[index] !== undefined 
                ? (data.scores[index] * 100).toFixed(1) + '%' 
                : '';
                
            const filename = data.filenames && data.filenames[index] 
                ? data.filenames[index] 
                : path.split('/').pop();
                
            let imagePath;
            try {
                imagePath = `/data/keyframes/${filename}`;
            } catch (e) {
                imagePath = '/static/images/no-image.png';
            }
            
            html += `
                <div class="image-item" style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; height: 100%;">
                    <div class="image-container" style="position: relative; padding-top: 100%;">
                        <img 
                            src="${imagePath}" 
                            alt="Result ${index + 1}"
                            onerror="this.onerror=null; this.src='/static/images/no-image.png'"
                            loading="lazy"
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                            onclick="window.ModalModule.openImageModal('${imagePath}', '${filename}', '${path}', '${score}')"
                        >
                    </div>
                    <div class="image-info" style="padding: 8px; font-size: 12px; background: #f8f9fa; border-top: 1px solid #eee; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                        <div class="image-filename" style="font-weight: bold; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${filename.replace(/\.jpg$/i, '')}">
                            ${filename.replace(/\.jpg$/i, '')}
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    // Public interface
    return {
        init: function() {
            if (window.AppElements.searchForm) {
                window.AppElements.searchForm.addEventListener('submit', handleSearch);
            }
            // Initialize image upload handling
            handleImageUpload();
        },
        
        handleSearch: handleSearch,
        displayResults: displayResults
    };
})(); 