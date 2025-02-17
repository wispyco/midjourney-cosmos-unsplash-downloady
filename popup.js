document.getElementById('downloadBtn').addEventListener('click', () => {
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
                    return;
                }

                console.log('JSZip injected, now running download script');

                // After JSZip is loaded, run our download script
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        console.log('Starting download script');

                        if (typeof JSZip === 'undefined') {
                            console.error('JSZip is still not available!');
                            alert('Error: JSZip library failed to load');
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

                                let urlMatch = backgroundImage.match(/url\("(.*?)"\)/);
                                if (urlMatch) {
                                    let url = urlMatch[1];
                                    let updatedUrl = url.replace(/\/[0-9]+_[0-9]+(_[0-9]+)?(_[A-Za-z])?\\.webp$/, '/0_0.jpeg');
                                    imageUrls.push(updatedUrl);
                                    console.log(`Extracted image ${index + 1}: ${updatedUrl}`);
                                } else {
                                    console.log(`Element ${index + 1}: No valid background image found`);
                                }
                            } catch (error) {
                                console.error(`Error processing element ${index + 1}:`, error);
                            }
                        });

                        if (imageUrls.length === 0) {
                            console.error("No images were found. Stopping execution.");
                            alert("No images found on this page");
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
                        }).catch(error => {
                            console.error("Error in download process:", error);
                            alert("Error during download process. Check console for details.");
                        });
                    }
                });
            });
        } else if (selectedSite === 'unsplash') {
            // First check if we're on a license-free page
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // Create a new JSZip instance
                    const zip = new JSZip();

                    // Find all image figures
                    const figures = document.querySelectorAll('figure[data-testid="photo-grid-masonry-figure"]');
                    const urlsToDownload = [];

                    figures.forEach(figure => {
                        // Find the main image element
                        const img = figure.querySelector('img[srcset]');
                        if (img) {
                            // Get the srcset attribute
                            const srcset = img.getAttribute('srcset');
                            // Split srcset into individual sources
                            const sources = srcset.split(',').map(s => s.trim());
                            // Get the last (highest resolution) source
                            const highestRes = sources[sources.length - 1];
                            // Extract just the URL (remove size and descriptor)
                            const url = highestRes.split(' ')[0];
                            urlsToDownload.push(url);
                        }
                    });

                    if (urlsToDownload.length === 0) {
                        alert('No images found on this page');
                        return;
                    }

                    // Download function for individual images
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
                    }).catch(error => {
                        console.error("Error in download process:", error);
                        alert("Error during download process. Check console for details.");
                    });
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
                    return;
                }

                console.log('JSZip injected, now running download script for Cosmos');

                // After JSZip is loaded, run our download script
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        console.log('Starting Cosmos download script');

                        if (typeof JSZip === 'undefined') {
                            console.error('JSZip is still not available!');
                            alert('Error: JSZip library failed to load');
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
                        }).catch(error => {
                            console.error("Error in download process:", error);
                            alert("Error during download process. Check console for details.");
                        });
                    }
                });
            });
        }
    });
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
                }).catch(error => {
                    console.error("Error in download process:", error);
                    alert("Error during download process. Check console for details.");
                });
            }
        });
    });
}
