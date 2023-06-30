/* eslint-disable @typescript-eslint/no-unused-vars */
import './styles/main.scss';
import { dialogTemplate } from './dialogTemplate';
import { bindEditorActions, populateEditor } from './editActions';
import { bindTemplateActions } from './templateActions';

(function ($, ns, channel, window, undefined) {
  "use strict";

  var ACTION_ICON = "coral-Icon--automatedSegment";
  var ACTION_TITLE = "Opax Content Generation";
  var ACTION_NAME = "aiContentAction";

  var aiContentAction = new Granite.author.ui.ToolbarAction({
    name: ACTION_NAME,
    icon: ACTION_ICON,
    text: ACTION_TITLE,
    execute: function (editable) {
      showDialog(editable);
    },
    condition: function (editable) {
      if (editable.config.designDialog === "/libs/core/wcm/components/text/v2/text/cq:design_dialog") {
        return editable;
      }
    },

    isNonMulti: true,
  });

  channel.on("cq-layer-activated", function (event) {
    if (event.layer === "Edit") {
      Granite.author.EditorFrame.editableToolbar.registerAction("aiContent", aiContentAction);
    }
  });

  function showDialog(editable) {
    // get editable.path and remove any slashes and colons
    var path = editable.path.replace(/\//g, "-").replace(/:/g, "-");

    // check if the dialog exists
    var dialog = document.querySelector(`#aiContentDialog-${path}`);
    if (dialog) {
      populateEditor(dialog, editable);
      dialog.show();
      return;
    }

    // otherwise create the dialog
    var dialog = new Coral.Dialog().set({
      id: `aiContentDialog-${path}`,
      class: `test`,
      movable: true,
      closable: 'on',
      header: {
        innerHTML: `AI Content Generation`
      },
      content: {
        innerHTML: dialogTemplate(path)
      }
    });

    bindEditorActions(dialog, editable);
    bindTemplateActions(dialog, editable);
    populateEditor(dialog, editable);


    // Open the dialog
    document.body.appendChild(dialog);

    $.ajax({
      url: `${editable.path}.json`,
      type: 'GET',

      success: function (res) {
        if (res.text) {
          dialog.content.querySelector("[data-edit-tab]").click();
        }
      },
      error: function (request, error) {
        console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
      }
    });
    dialog.show();
  }
}(jQuery, Granite.author, jQuery(document), this, Coral));


