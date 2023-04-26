import { generateTemplatePrompt } from './prompts';
import { clearTemplateFields } from './utils';
import Quill from 'quill';

function bindTemplateActions(dialog, editable) {

    var tabs = dialog.content.querySelector("[data-ai-tabs]");
    var loader = dialog.content.querySelector("#gpt-loader");
    var footer = dialog.footer;


    // get template selector
    var templateSelector = dialog.content.querySelector("[data-template-selector]");
    var activeTemplate;

    $(templateSelector).on('click', 'coral-masonry-item', function () {
        // get the data-template-button attribute of this
        var templateToShow = this.getAttribute('data-template-button');
        activeTemplate = templateToShow;
        // find data-template-panel=templateToShow
        var panelToShow = dialog.content.querySelector(`[data-template-panel="${templateToShow}"]`);

        // set hidden attribute on all data-template-panel elements
        var panels = dialog.content.querySelectorAll("[data-template-panel]");
        panels.forEach(function (panel) {
            panel.setAttribute('hidden', '');
        });

        // show the panel
        panelToShow.removeAttribute('hidden');
    });

    // attach click event to data-template-save-button
    var saveButton = dialog.content.querySelector("[data-template-save-button]");
    saveButton.addEventListener('click', function () {
        // get the content from the review-content div
        var content = dialog.content.querySelector("[data-template-field='review-content'] > div").innerHTML;
        // save the content
        $.ajax({
            url: `${editable.path}.html`,
            type: 'POST',
            data: {
                './text': content,
                './textIsRich': 'true'
            },
            success: function () {
                editable.refresh();
                clearTemplateFields(dialog);
                dialog.hide();
            },
            error: function (request, error) {
                console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
            }
        });
    });

    // attach click event to data-template-generate-content-button
    var generateContentButton = dialog.content.querySelector("[data-template-generate-content-button]");
    generateContentButton.addEventListener('click', function () {
        const prompt = generateTemplatePrompt(activeTemplate, dialog);
        requestTemplatePrompt(prompt);
    });

    function populateForReview(content) {
        var reviewContent = dialog.content.querySelector("[data-template-field='review-content']");
        reviewContent.innerHTML = content;
    }



    function requestTemplatePrompt(prompt) {
        loader.hidden = false;
        tabs.hidden = true;
        footer.hidden = true;

        prompt = prompt.trim();
        var servletUrl = `/bin/chat?prompt=${prompt}`;

        fetch(servletUrl)
            .then(response => {
                if (!response.ok) {
                    const toast = new Coral.Toast().set({
                        content: {
                            textContent: 'An error has occured.'
                        },
                        duration: 3000,
                        type: 'error',
                    });
                    toast.style.width = '318px';
                    toast.show();
                    throw new Error('Network response was not ok for requestTemplatePrompt');
                }
                return response.json();
            }).then(response => {

                console.log(response);

                loader.hidden = true;
                tabs.hidden = false;
                footer.hidden = false;

                populateForReview(response.data);

                var toolbarOptions = [
                    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                    ['blockquote', 'code-block'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'script': 'sub' }, { 'script': 'super' }],      // superscript/subscript
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    [{ 'align': [] }],
                    ['clean']                                         // remove formatting button
                ];

                // destroy the toolbar if it exists
                if (dialog.querySelector('.ql-toolbar')) {
                    dialog.querySelector('.ql-toolbar').remove();
                }

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                var editor = new Quill('[data-template-field="review-content"]', {
                    modules: {
                        toolbar: toolbarOptions,
                        clipboard: {
                            matchVisual: false
                        }
                    },
                    theme: 'snow'
                });
            })

            .catch(error => {
                const toast = new Coral.Toast().set({
                    content: {
                        textContent: 'An error has occured.'
                    },
                    duration: 3000,
                    type: 'error',
                });
                toast.style.width = '318px';
                toast.show();
                console.error('There was a problem with the fetch operation:', error);
            });
    }
}

export { bindTemplateActions };
