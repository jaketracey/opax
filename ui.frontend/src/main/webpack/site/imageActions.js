function bindImageEvents(dialog) {
    // add event listener to image-generate button to call requestImagePrompt function
    dialog.content.querySelector('#image-generate').addEventListener('click', function () {

        let prompt = dialog.content.querySelector("#image-prompt").value;
        requestImagePrompt(prompt);
    });

    function requestImagePrompt(prompt) {
        loader.hidden = false;
        tabs.hidden = true;
        footer.hidden = true;
        const xhr = new XMLHttpRequest();

        xhr.open('POST', 'https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4');
        xhr.setRequestHeader('Authorization', 'Bearer xxxx');
        xhr.responseType = 'blob';
        xhr.onload = function () {
            if (xhr.status === 200) {
                loader.hidden = true;
                tabs.hidden = false;
                footer.hidden = false;

                console.log(xhr.response);

                const fileReader = new FileReader();
                fileReader.onload = function () {
                    const srcData = fileReader.result;
                    console.log('base64:', srcData);
                    dialog.content.querySelector('#image-holder').setAttribute('src', srcData);
                };
                fileReader.readAsDataURL(xhr.response);
            } else {
                const toast = new Coral.Toast().set({
                    content: {
                        textContent: 'An error has occured.'
                    },
                    duration: 3000,
                    variant: 'error',
                });
                toast.style.width = '318px';
                toast.show();
                console.log('Request: ' + JSON.stringify(xhr) + '\n' + 'Error: ' + JSON.stringify(xhr.statusText));
            }
        };
        xhr.send(JSON.stringify({ 'inputs': prompt, 'wait_for_model': true }));
    }

    // // add event listener to save-to-dam to save the image source to dam
    // dialog.content.querySelector('#save-to-dam').addEventListener('click', function () {
    //     const prompt = dialog.content.querySelector("#image-prompt").value;

    //     const targetUrl = `/api/assets/aemgpt/*`;
    //     const blob = new Blob([dialog.content.querySelector('#image-holder').getAttribute('src')], { type: 'image/png' });
    // });

    // add event listener to download-image to download the image source
    dialog.content.querySelector('#download-image').addEventListener('click', function () {
        var image = dialog.content.querySelector('#image-holder').getAttribute('src');
        var link = document.createElement('a');
        link.download = 'image.png';
        link.href = image;
        link.click();
    });

}

export { bindImageEvents };

