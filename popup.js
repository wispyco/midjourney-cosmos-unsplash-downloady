document.getElementById('downloadBtn').addEventListener('click', async (e) => {
    const button = e.target;
    // Disable button and show loading state
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Downloading...';

    try {
        console.log('Download button clicked');
        const selectedSite = document.querySelector('input[name="site"]:checked').value;
        console.log('Selected site:', selectedSite);

        // Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (chrome.runtime.lastError) {
                console.error('Error getting active tab:', chrome.runtime.lastError);
                return;
            }

            if (!tabs[0]?.id) {
                console.error('No active tab found');
                return;
            }

            const tabId = tabs[0].id;
            console.log('Injecting into tab:', tabId);

            if (selectedSite === 'midjourney') {
                // First inject JSZip library directly
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['jszip.min.js']
                }, (injectionResults) => {
                    if (chrome.runtime.lastError) {
                        console.error('JSZip injection error:', chrome.runtime.lastError);
                        button.disabled = false;
                        button.textContent = originalText;
                        return;
                    }

                    console.log('JSZip injected, now running download script');

                    // After JSZip is loaded, run our download script
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => {
                            return new Promise((resolve, reject) => {
                                console.log('Starting download script');

                                if (typeof JSZip === 'undefined') {
                                    console.error('JSZip is still not available!');
                                    alert('Error: JSZip library failed to load');
                                    reject(new Error('JSZip is not available'));
                                    return;
                                }

                                // Extract image URLs
                                let elements = document.querySelectorAll('a.block.bg-cover.bg-center.w-full.h-full');
                                console.log(`Found ${elements.length} potential image elements`);

                                let imageUrls = [];

                                elements.forEach((element, index) => {
                                    try {
                                        let style = window.getComputedStyle(element);
                                        let backgroundImage = style.getPropertyValue('background-image');
                                        console.log(`Element ${index + 1} background-image:`, backgroundImage);

                                        // Extract all URLs from the image-set
                                        let urls = backgroundImage.match(/url\("([^"]+)"\)/g);
                                        if (urls && urls.length >= 2) {
                                            // Get the second URL (the 2x version)
                                            let url = urls[1].match(/url\("([^"]+)"\)/)[1];
                                            // First convert webp to jpeg
                                            let updatedUrl = url.replace(/\/[0-9]+_[0-9]+(_[0-9]+)?(_[A-Z])?.webp$/, '/0_0.jpeg');
                                            // Then remove any ?format= parameters
                                            updatedUrl = updatedUrl.split('?')[0];
                                            imageUrls.push(updatedUrl);
                                            console.log(`Extracted 2x image ${index + 1}: ${updatedUrl}`);
                                        } else {
                                            console.log(`Element ${index + 1}: No valid image-set found`);
                                        }
                                    } catch (error) {
                                        console.error(`Error processing element ${index + 1}:`, error);
                                    }
                                });

                                if (imageUrls.length === 0) {
                                    console.error("No images were found. Stopping execution.");
                                    alert("No images found on this page");
                                    reject(new Error('No images found'));
                                    return;
                                }

                                console.log(`Total extracted image URLs: ${imageUrls.length}`);

                                // Create ZIP file with images
                                const zip = new JSZip();

                                // Create a text file with original URLs
                                const urlList = imageUrls.join('\n');
                                zip.file('image_urls.txt', urlList);
                                console.log('Added URL list to ZIP');

                                // Function to download an individual image
                                async function downloadImage(url, filename) {
                                    console.log(`Starting download for ${filename} from ${url}`);
                                    try {
                                        const response = await fetch(url);
                                        if (!response.ok) {
                                            throw new Error(`HTTP error! status: ${response.status}`);
                                        }
                                        const blob = await response.blob();
                                        zip.file(filename, blob);
                                        console.log(`Successfully added ${filename} to ZIP`);
                                    } catch (error) {
                                        console.error(`Failed to download ${url}:`, error);
                                    }
                                }

                                // Download all images
                                Promise.all(
                                    imageUrls.map((url, index) =>
                                        downloadImage(url, `image_${index + 1}.jpeg`)
                                    )
                                ).then(() => {
                                    console.log("All images processed, generating ZIP");
                                    return zip.generateAsync({ type: "blob" });
                                }).then(content => {
                                    console.log("ZIP generated, initiating download");
                                    const link = document.createElement('a');
                                    link.href = URL.createObjectURL(content);
                                    link.download = "images.zip";
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    console.log("Download initiated");
                                    console.log("Download completed");
                                    resolve();
                                }).catch(error => {
                                    console.error("Error in download process:", error);
                                    alert("Error during download process. Check console for details.");
                                    reject(error);
                                });
                            });
                        }
                    }).then(() => {
                        // Re-enable button in popup context
                        button.disabled = false;
                        button.textContent = originalText;
                    }).catch(error => {
                        console.error("Error in download process:", error);
                        button.disabled = false;
                        button.textContent = originalText;
                    });
                });
            } else if (selectedSite === 'unsplash') {
                // First check if we're on a license-free page
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        const url = window.location.href;
                        const hasLicenseFree = url.includes('license=free');
                        if (!hasLicenseFree) {
                            if (confirm('This will download license-free images only. Would you like to switch to license-free images? MAKE SURE TO CLICK DOWNLOAD AGAIN AFTER SWITCHING TO LICENSE-FREE IMAGES')) {
                                // Add license=free parameter
                                const newUrl = url + (url.includes('?') ? '&' : '?') + 'license=free';
                                window.location.href = newUrl;
                                return { reload: true };
                            }
                            return { reload: false };
                        }
                        return { reload: false, hasLicenseFree: true };
                    }
                }, (results) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error:', chrome.runtime.lastError);
                        return;
                    }

                    const result = results[0].result;

                    if (result.reload) {
                        // Wait for page to reload before starting download
                        chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
                            if (updatedTabId === tabId && info.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(listener);
                                startUnsplashDownload(tabId);
                            }
                        });
                    } else if (result.hasLicenseFree) {
                        // Already on license-free page, start download
                        startUnsplashDownload(tabId);
                    } else {
                        // User declined to switch to license-free
                        alert('Download canceled. Please switch to license-free images to download.');
                    }
                });
            } else if (selectedSite === 'cosmos') {
                // First inject JSZip library directly
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['jszip.min.js']
                }, (injectionResults) => {
                    if (chrome.runtime.lastError) {
                        console.error('JSZip injection error:', chrome.runtime.lastError);
                        button.disabled = false;
                        button.textContent = originalText;
                        return;
                    }

                    console.log('JSZip injected, now running download script for Cosmos');

                    // After JSZip is loaded, run our download script
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => {
                            return new Promise((resolve, reject) => {
                                console.log('Starting Cosmos download script');

                                if (typeof JSZip === 'undefined') {
                                    console.error('JSZip is still not available!');
                                    alert('Error: JSZip library failed to load');
                                    reject(new Error('JSZip is not available'));
                                    return;
                                }

                                // Extract image URLs for Cosmos
                                let elements = document.querySelectorAll('img[data-testid="ElementImage_Image"]');
                                console.log(`Found ${elements.length} potential image elements`);

                                let imageUrls = [];

                                elements.forEach((element, index) => {
                                    try {
                                        const url = element.src;
                                        if (url) {
                                            imageUrls.push(url);
                                            console.log(`Extracted image ${index + 1}: ${url}`);
                                        } else {
                                            console.log(`Element ${index + 1}: No valid image source found`);
                                        }
                                    } catch (error) {
                                        console.error(`Error processing element ${index + 1}:`, error);
                                    }
                                });

                                if (imageUrls.length === 0) {
                                    console.error("No images were found. Stopping execution.");
                                    alert("No images found on this page");
                                    reject(new Error('No images found'));
                                    return;
                                }

                                console.log(`Total extracted image URLs: ${imageUrls.length}`);

                                // Create ZIP file with images
                                const zip = new JSZip();

                                // Create a text file with original URLs
                                const urlList = imageUrls.map(url => url.split('?')[0]).join('\n');
                                zip.file('image_urls.txt', urlList);
                                console.log('Added URL list to ZIP');

                                // Function to download an individual image
                                async function downloadImage(url, filename) {
                                    // Remove query parameters and handle extensions properly
                                    let cleanUrl = url;
                                    if (url.includes('?')) {
                                        cleanUrl = url.substring(0, url.indexOf('?'));
                                    }

                                    // Don't add .webp if URL already has an extension
                                    if (!cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i)) {
                                        cleanUrl += '.webp';
                                    }

                                    console.log(`Starting download for ${filename} from ${cleanUrl}`);
                                    try {
                                        const response = await fetch(cleanUrl);
                                        if (!response.ok) {
                                            throw new Error(`HTTP error! status: ${response.status}`);
                                        }
                                        const blob = await response.blob();
                                        zip.file(filename, blob);
                                        console.log(`Successfully added ${filename} to ZIP`);
                                    } catch (error) {
                                        console.error(`Failed to download ${url}:`, error);
                                    }
                                }

                                // Download all images
                                Promise.all(
                                    imageUrls.map((url, index) =>
                                        downloadImage(url, `cosmos_image_${index + 1}.jpg`)
                                    )
                                ).then(() => {
                                    console.log("All images processed, generating ZIP");
                                    return zip.generateAsync({ type: "blob" });
                                }).then(content => {
                                    console.log("ZIP generated, initiating download");
                                    const link = document.createElement('a');
                                    link.href = URL.createObjectURL(content);
                                    link.download = "cosmos_images.zip";
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    console.log("Download initiated");
                                    console.log("Download completed");
                                    resolve();
                                }).catch(error => {
                                    console.error("Error in download process:", error);
                                    alert("Error during download process. Check console for details.");
                                    reject(error);
                                });
                            });
                        }
                    }).then(() => {
                        // Re-enable button in popup context
                        button.disabled = false;
                        button.textContent = originalText;
                    }).catch(error => {
                        console.error("Error in download process:", error);
                        button.disabled = false;
                        button.textContent = originalText;
                    });
                });
            }
        });
    } catch (error) {
        console.error("Error:", error);
        button.disabled = false;
        button.textContent = originalText;
    }
});

// Load the last selected site when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['selectedSite'], (data) => {
        if (data.selectedSite) {
            const radio = document.querySelector(`input[name="site"][value="${data.selectedSite}"]`);
            if (radio) radio.checked = true;
        }
    });
});

// Save the selected site whenever it changes
document.querySelectorAll('input[name="site"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        chrome.storage.local.set({ selectedSite: e.target.value });
    });
});

// Add this function outside the click handler
function startUnsplashDownload(tabId) {
    // First inject JSZip library directly
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['jszip.min.js']
    }, (injectionResults) => {
        if (chrome.runtime.lastError) {
            console.error('JSZip injection error:', chrome.runtime.lastError);
            return;
        }

        console.log('JSZip injected, now running download script for Unsplash');

        // After JSZip is loaded, run our download script
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                console.log('Starting Unsplash download script');

                if (typeof JSZip === 'undefined') {
                    console.error('JSZip is still not available!');
                    alert('Error: JSZip library failed to load');
                    return;
                }

                // Extract image URLs for Unsplash
                let urlsToDownload = [];

                document.querySelectorAll('img').forEach(img => {
                    const srcset = img.getAttribute('srcset');

                    if (srcset) {
                        // Split srcset into individual candidates
                        const candidates = srcset.split(',').map(s => s.trim());

                        // Find the one just before 1200w
                        let selectedUrl = null;

                        for (let i = 0; i < candidates.length; i++) {
                            const [url, size] = candidates[i].split(/\s+/);
                            if (size === '1200w') {
                                selectedUrl = candidates[i - 1]?.split(/\s+/)[0]; // Get the one before 1200w
                                break;
                            }
                        }

                        if (selectedUrl) {
                            console.log(`Image before 1200w: ${selectedUrl}`);
                            urlsToDownload.push(selectedUrl);
                        }
                    }
                });

                if (urlsToDownload.length === 0) {
                    console.error("No images were found. Stopping execution.");
                    alert("No images found on this page");
                    return;
                }

                console.log(`Total extracted image URLs: ${urlsToDownload.length}`);

                // Create ZIP file with images
                const zip = new JSZip();

                // Create a text file with original URLs
                const urlList = urlsToDownload.join('\n');
                zip.file('image_urls.txt', urlList);
                console.log('Added URL list to ZIP');

                // Function to download an individual image
                async function downloadImage(url, filename) {
                    console.log(`Starting download for ${filename} from ${url}`);
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        const blob = await response.blob();
                        zip.file(filename, blob);
                        console.log(`Successfully added ${filename} to ZIP`);
                    } catch (error) {
                        console.error(`Failed to download ${url}:`, error);
                    }
                }

                // Download all images
                Promise.all(
                    urlsToDownload.map((url, index) =>
                        downloadImage(url, `unsplash_image_${index + 1}.jpg`)
                    )
                ).then(() => {
                    console.log("All images processed, generating ZIP");
                    return zip.generateAsync({ type: "blob" });
                }).then(content => {
                    console.log("ZIP generated, initiating download");
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = "unsplash_images.zip";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    console.log("Download initiated");
                    console.log("Download completed");
                }).catch(error => {
                    console.error("Error in download process:", error);
                    alert("Error during download process. Check console for details.");
                });
            }
        });
    });
}
