/* Get the contents of the entire page */

function getPageContents() {
    var pageContents = document.querySelector("#ContentFrame").contentDocument.documentElement;
    var mainElement = pageContents.querySelector("main");
    var headings = mainElement.querySelectorAll("h1, h2, h3, h4, h5, h6");
    var paragraphs = mainElement.querySelectorAll("p");
    var title = pageContents.querySelector("title").innerHTML;
    var pageText = title + " ";
    for (var i = 0; i < headings.length; i++) {
        pageText += headings[i].innerText + " ";
    }
    for (var i = 0; i < paragraphs.length; i++) {
        pageText += paragraphs[i].innerText + " ";
    }

    return pageText;
}


function getElementContents(editable) {
    $.ajax({
        url: `${editable.path}.json`,
        type: 'GET',

        success: function (res) {
            return res.text;
        },
        error: function (request, error) {
            console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
        }
    });
}


function clearTemplateFields(dialog) {
    var fields = dialog.content.querySelectorAll("[data-template-field]");
    fields.forEach(function(field) {
        field.value = '';
        field.innerHTML = '';
    });

    // set selected on the first coral-step
    var coralStepList = dialog.content.querySelector("coral-steplist");
    coralStepList.previous();
    coralStepList.previous();
    }


export { getPageContents, getElementContents, clearTemplateFields };
