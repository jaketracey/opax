import Quill from 'quill';
import { clearTemplateFields } from "./utils";

function updateEditor(newText, dialog) {
    // first, populate the editor with the current content
    dialog.querySelector('[data-edit-editor]').innerHTML = newText;

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
    var editor = new Quill('[data-edit-editor]', {
        modules: {
            toolbar: toolbarOptions,
            clipboard: {
                matchVisual: false
            }
        },
        theme: 'snow'
    });
}

function populateEditor(dialog, editable) {
    // first, populate the editor with the current content
    $.ajax({
        url: `${editable.path}.json`,
        type: 'GET',

        success: function (res) {
            dialog.querySelector('[data-edit-editor]').innerHTML = res.text;

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
            var editor = new Quill('[data-edit-editor]', {
                modules: {
                    toolbar: toolbarOptions,
                    clipboard: {
                        matchVisual: false
                    }
                },
                theme: 'snow'
            });
        },
        error: function (request, error) {
            console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
        }
    });
}

function bindEditorActions(dialog, editable) {
    var tabs = dialog.content.querySelector("[data-ai-tabs]");
    var loader = dialog.content.querySelector("#gpt-loader");
    var footer = dialog.footer;

    function requestEditPrompt(prompt) {
        loader.hidden = false;
        tabs.hidden = true;
        footer.hidden = true;

        var servletUrl = `/bin/chat`;

        fetch(servletUrl, {
            method: 'POST',
            body: JSON.stringify(prompt),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }).then(response => {
            if (!response.ok) {
                const toast = new Coral.Toast().set({
                    content: {
                        textContent: 'An error has occured.'
                    },
                    duration: 3000,
                    variant: 'error',
                });
                toast.style.width = '318px';
                toast.show();
                loader.hidden = true;
                tabs.hidden = false;
                footer.hidden = false;
                throw new Error('Network response was not ok for requestEditPrompt');
            }
            return response.json();
        }).then(response => {
            loader.hidden = true;
            tabs.hidden = false;
            footer.hidden = false;

            // convert back to html
            var html = new DOMParser().parseFromString(response.data, "text/html");
            updateEditor(html.documentElement.textContent, dialog);
        })

            .catch(error => {
                const toast = new Coral.Toast().set({
                    content: {
                        textContent: 'An error has occured.'
                    },
                    duration: 3000,
                    variant: 'error',
                });
                toast.style.width = '318px';
                toast.show();
                console.error('There was a problem with the fetch operation:', error);
                loader.hidden = true;
                tabs.hidden = false;
                footer.hidden = false;
            });
    }



    var editorSaveButton = dialog.content.querySelector("[data-edit-save-button]");
    editorSaveButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML;
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

    var proofReadButton = dialog.content.querySelector("[data-edit-action-proof-read]");
    proofReadButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'proof-read', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var summarizeButton = dialog.content.querySelector("[data-edit-action-summarize]");
    summarizeButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'summarize', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveReadabilityButton = dialog.content.querySelector("[data-edit-action-improve-readability]");
    improveReadabilityButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-readability', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveClarityButton = dialog.content.querySelector("[data-edit-action-improve-clarity]");
    improveClarityButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-clarity', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveGrammarButton = dialog.content.querySelector("[data-edit-action-improve-grammar]");
    improveGrammarButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-grammar', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveToneButton = dialog.content.querySelector("[data-edit-action-improve-tone]");
    improveToneButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-tone', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveStructureButton = dialog.content.querySelector("[data-edit-action-improve-structure]");
    improveStructureButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-structure', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveFlowButton = dialog.content.querySelector("[data-edit-action-improve-flow]");
    improveFlowButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-flow', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var makeLongerButton = dialog.content.querySelector("[data-edit-action-make-longer]");
    makeLongerButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'make-longer', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var makeShorterButton = dialog.content.querySelector("[data-edit-action-make-shorter]");
    makeShorterButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'make-shorter', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var simplifyButton = dialog.content.querySelector("[data-edit-action-simplify]");
    simplifyButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'simplify', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    var improveSEOButton = dialog.content.querySelector("[data-edit-action-improve-seo]");
    improveSEOButton.addEventListener('click', function () {
        var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
        var prompt = { "templateId": 'improve-seo', "dataAttributes": { "content": content } };
        requestEditPrompt(prompt);
    });

    // Translate
    dialog.content.querySelector("[data-edit-action-translate]").addEventListener("click", function () {
        // get the current content
        $.ajax({
            url: `${editable.path}.json`,
            type: 'GET',

            success: function (res) {
                currentContent = res.text;
                var language = dialog.content.querySelector("[data-edit-translate-targetlang]").value;
                var content = dialog.content.querySelector("[data-edit-editor] > div").innerHTML.trim();
                var prompt = { "templateId": 'translate', "dataAttributes": { "content": content, "language": language } };

                requestEditPrompt(prompt);
                dialog.content.querySelector("[data-edit-tab]").click();
            },
            error: function (request, error) {
                console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
            }
        });

    });

}
export { bindEditorActions, populateEditor };
