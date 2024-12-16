// Save settings to Chrome storage
async function saveSettings() {
    const modelSelection = document.querySelector('input[name="provider-selection"]:checked').id;
    const settings = {
        modelSelection,
        openai: {
            apiKey: document.getElementById('openai-key').value,
            model: document.getElementById('openai-model').value
        },
        anthropic: {
            apiKey: document.getElementById('anthropic-key').value,
            model: document.getElementById('anthropic-model').value
        },
        ollama: {
            model: document.getElementById('ollama-model').value
        }
    };

    try {
        await chrome.storage.sync.set({ settings });
        // Optional: Show save confirmation
        const saveButton = document.querySelector('button[type="submit"]');
        const originalText = saveButton.textContent;
        saveButton.textContent = 'Saved!';
        setTimeout(() => {
            saveButton.textContent = originalText;
        }, 2000);
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// Load settings from Chrome storage
async function loadSettings() {
    try {
        const data = await chrome.storage.sync.get('settings');
        const settings = data.settings;

        if (settings) {
            // Set model selection
            const modelRadio = document.getElementById(settings.modelSelection);
            if (modelRadio) modelRadio.checked = true;

            // Set OpenAI settings
            if (settings.openai) {
                document.getElementById('openai-key').value = settings.openai.apiKey || '';
                document.getElementById('openai-model').value = settings.openai.model || 'gpt-4';
            }

            // Set Anthropic settings
            if (settings.anthropic) {
                document.getElementById('anthropic-key').value = settings.anthropic.apiKey || '';
                document.getElementById('anthropic-model').value = settings.anthropic.model || 'claude-3-opus';
            }

            // Set Ollama settings
            if (settings.ollama) {
                document.getElementById('ollama-model').value = settings.ollama.model || 'llama2';
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Initialize event listeners and load settings
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved settings
    await loadSettings();

    // Add save button event listener
    const form = document.querySelector('form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettings();
    });

    // Add cancel button event listener
    const cancelButton = document.querySelector('button[type="button"]');
    cancelButton.addEventListener('click', () => {
        loadSettings(); // Reset to saved settings
    });

    // Add radio button change listeners to enable/disable corresponding inputs
    const radioButtons = document.querySelectorAll('input[name="provider-selection"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
            // Enable/disable input fields based on selection
            const openaiInputs = document.querySelectorAll('#openai-key, #openai-model');
            const anthropicInputs = document.querySelectorAll('#anthropic-key, #anthropic-model');
            const ollamaInputs = document.querySelectorAll('#ollama-model');

            openaiInputs.forEach(input => input.disabled = radio.id !== 'openai');
            anthropicInputs.forEach(input => input.disabled = radio.id !== 'anthropic');
            ollamaInputs.forEach(input => input.disabled = radio.id !== 'ollama');
        });
    });

    // Initial trigger of radio button change event to set initial state
    const checkedRadio = document.querySelector('input[name="provider-selection"]:checked');
    if (checkedRadio) {
        checkedRadio.dispatchEvent(new Event('change'));
    }
});