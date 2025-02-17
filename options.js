document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('optionsForm');

    // Load any existing options
    chrome.storage.local.get(['selectedSite'], (data) => {
        console.log('Loading saved options');
        if (data.selectedSite) {
            console.log('Found saved site:', data.selectedSite);
            const radio = document.querySelector(`input[name="site"][value="${data.selectedSite}"]`);
            if (radio) radio.checked = true;
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Saving options');

        const selectedSite = document.querySelector('input[name="site"]:checked').value;

        chrome.storage.local.set({
            selectedSite
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving options:', chrome.runtime.lastError);
                alert('Error saving options: ' + chrome.runtime.lastError.message);
            } else {
                console.log('Options saved successfully');
                alert('Options saved successfully! You can now close this page and use the extension.');
            }
        });
    });
});
