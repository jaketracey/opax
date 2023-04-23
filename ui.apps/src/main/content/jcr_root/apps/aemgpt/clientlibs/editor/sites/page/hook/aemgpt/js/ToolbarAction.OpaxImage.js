(function ($, ns, channel, window, undefined) {
  "use strict";


  var ACTION_ICON = "coral-Icon--automatedSegment";
  var ACTION_TITLE = "AI Image Generation";
  var ACTION_NAME = "aiImageGeneration";

  var aiContentAction = new Granite.author.ui.ToolbarAction({
    name: ACTION_NAME,
    icon: ACTION_ICON,
    text: ACTION_TITLE,
    execute: function (editable) {
      showDialog(editable);
    },
    condition: function (editable) {
      return editable;
    },

    isNonMulti: true,
  });

  channel.on("cq-layer-activated", function (event) {
    if (event.layer === "Edit") {
      Granite.author.EditorFrame.editableToolbar.registerAction("aiImageGeneration", aiContentAction);
    }
  });


  function showDialog(editable) {
    // get editable.path and remove any slashes and colons
    var path = editable.path.replace(/\//g, "-").replace(/:/g, "-");

    // check if the dialog exists
    var dialog = document.querySelector(`#aiImageDialog-${path}`);
    if (dialog) {
      dialog.show();
      return;
    }

    var dialog = new Coral.Dialog().set({
      id: `aiImageDialog-${path}`,
      class: `test`,
      movable: true,
      closable: 'on',
      header: {
        innerHTML: `AI Content Generation`
      },
      content: {
        innerHTML: `
<div style="min-width: calc(50vw);">
      <h2>Image</h2>
      <textarea
  is="coral-textarea"
  class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
  id="image-prompt"
  style="width: 100%;"
  rows="1"></textarea>
  <button style="margin-top: 15px;"

                is="coral-button"
                variant="primary"
                id="image-generate">
              Generate image
              </button>
                <br />
                <div style="margin-top: 26px; display: inline-block; width:400px; height:400px; position: relative; text-align: center; border: 1px dashed gray;" id="targetComponent"><img style="position: absolute; top: 0; bottom: 0; left: 0; right: 0; width: inherit;" id="image-holder" /></div>


                <coral-quickactions style="margin-bottom: 16px;" placement="bottom" target="#targetComponent">
  <coral-quickactions-item icon="upload" type="button" id="save-to-dam">
    Save to DAM
  </coral-quickactions-item>
  <coral-quickactions-item icon="download" type="button" id="download-image">
    Download
  </coral-quickactions-item>
</coral-quickactions>


      </div>
              `
      },
      footer: {
        innerHTML: ''
      }
    });

    var loader = dialog.content.querySelector("#gpt-loader");
    var footer = dialog.footer;
    var currentContent;


    // get the current content
    $.ajax({
      url: `${editable.path}.json`,
      type: 'GET',

      success: function (res) {
        console.log(res)
      },
      error: function (request, error) {
        console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
      }
    });

    // // attach click event to data-template-save-button
    // var saveButton = dialog.content.querySelector("[data-template-save-button]");
    // saveButton.addEventListener('click', function(e) {
    //   // get the content from the review-content div
    //   var content = dialog.content.querySelector("[data-template-field='review-content']").innerHTML;
    //   // save the content
    //   $.ajax({
    //     url: `${editable.path}.html`,
    //     type: 'POST',
    //     data: {
    //       './text': content,
    //       './textIsRich': 'true'
    //     },
    //     success: function (res) {
    //       editable.refresh();
    //       clearTemplateFields();
    //       dialog.hide();
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });
    // });

    // add event listener to image-generate button to call requestImagePrompt function
    dialog.content.querySelector('#image-generate').addEventListener('click', function () {

      let prompt = dialog.content.querySelector("#image-prompt").value;
      requestImagePrompt(prompt);
    });

    function requestImagePrompt(prompt) {
      const xhr = new XMLHttpRequest();

      xhr.open('POST', 'https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4');
      xhr.setRequestHeader('Authorization', 'Bearer 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');
      xhr.responseType = 'blob';
      xhr.onload = function() {
        if (xhr.status === 200) {
          console.log(xhr.response);

          const fileReader = new FileReader();
          fileReader.onload = function() {
            const srcData = fileReader.result;
            console.log('base64:', srcData);
            dialog.content.querySelector('#image-holder').setAttribute('src', srcData);
          };
          fileReader.readAsDataURL(xhr.response);
        } else {
          const toast = new Coral.Toast().set({
            content: {
              textContent: 'An error has occured'
            }
          });
          toast.style.width = '318px';
          toast.show();
          console.log('Request: ' + JSON.stringify(xhr) + '\n' + 'Error: ' + JSON.stringify(xhr.statusText));
        }
      };
      xhr.send(JSON.stringify({'inputs': prompt, 'wait_for_model': true}));
    }

    // add event listener to download-image to download the image source
    dialog.content.querySelector('#download-image').addEventListener('click', function () {
      var image = dialog.content.querySelector('#image-holder').getAttribute('src');
      var link = document.createElement('a');
      link.download = 'image.png';
      link.href = image;
      link.click();
    });


    // Open the dialog
    document.body.appendChild(dialog);
    dialog.show();
  }
}(jQuery, Granite.author, jQuery(document), this, Coral));


