import Quill from 'quill';

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
      console.log(editable);
      if(editable.config.designDialog === "/libs/core/wcm/components/text/v2/text/cq:design_dialog") {
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

      dialog.show();


      return;
    }

    var currentContent;


    // get the current content
    $.ajax({
      url: `${editable.path}.json`,
      type: 'GET',

      success: function (res) {
        currentContent = res.text;
      },
      error: function (request, error) {
        console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
      }
    });


    var dialog = new Coral.Dialog().set({
      id: `aiContentDialog-${path}`,
      class: `test`,
      movable: true,
      closable: 'on',
      header: {
        innerHTML: `Opax AI Content Generation`
      },
      content: {
        innerHTML: `
<div style="min-width: calc(70vw);">

        <div id="gpt-loader" hidden
        style="padding: 100px 0px"><coral-wait
        size="L"
        variant="dots"
        centered
        >

        <style type="text/css">
        coral-dialog-content {
          padding: 1px;
        }
        </style>

      </coral-wait><p style="text-align:center; margin-top:60px;">Preparing your content...</p></div>
      <coral-tabview data-ai-tabs style="margin-top: 0px;" class="coral3-TabView">
        <coral-tablist
          target="#tabPanel"
          size="S"
          class="coral3-TabList"
          orientation="horizontal"
          role="tablist"
          id="coral-tablist-${path}"
          aria-multiselectable="false">
          <coral-tab
          id="tab0-${path}"
          aria-controls="coral-id-tab0-${path}"
          class="coral3-Tab is-selected"
          role="tab"
          aria-selected="true"
          selected>
          <coral-tab-label>Write</coral-tab-label>
        </coral-tab>
          <coral-tab
            id="tab1-${path}"
            aria-controls="coral-id-tab1-${path}"
            class="coral3-Tab"
            role="tab"
            >
            <coral-tab-label>Edit</coral-tab-label>
          </coral-tab>
          <coral-tab
            id="tab2-${path}"
            aria-controls="coral-id-tab2-${path}"
            class="coral3-Tab"
            role="tab"
            >
            <coral-tab-label>Translate</coral-tab-label>
          </coral-tab>
        </coral-tablist>
        <coral-panelstack
          id="tabPanel-${path}"
          style="margin-top: 20px;"
          class="coral3-PanelStack"
          role="presentation">

          <coral-panel
            class="coral3-Panel is-selected"
            id="coral-id-tab0-${path}"
            aria-labelledby="tab0-${path}"
            role="tabpanel"
            aria-hidden="false"
            selected="">
            <coral-panel-content>


<coral-wizardview>
  <coral-steplist coral-wizardview-steplist="" style="margin-bottom: 20px;">
    <coral-step>Select template</coral-step>
    <coral-step>Configure</coral-step>
    <coral-step>Review</coral-step>
  </coral-steplist>
  <coral-panelstack coral-wizardview-panelstack="">
    <coral-panel>


<coral-masonry data-template-selector layout="variable" spacing="10" columnwidth="250">
  <coral-masonry-item data-template-button="free-prompt" coral-wizardview-next=""><h3>Free prompt</h3>Write a prompt to generate the perfect copy</coral-masonry-item>
  <coral-masonry-item data-template-button="content-summarizer" coral-wizardview-next=""><h3>Content Summarizer</h3>Uncover the essential nuggets of information from a piece of content by extracting the key bullet points.</coral-masonry-item>
  <coral-masonry-item data-template-button="aida-framework" coral-wizardview-next=""><h3>AIDA Framework</h3>Elevate your persuasive skills by implementing the time-tested Attention, Interest, Desire, Action framework. </coral-masonry-item>
  <coral-masonry-item data-template-button="bab-framework" coral-wizardview-next=""><h3>Before-After-Bridge Framework</h3>Write effective marketing copy with the BAB framework: Before, After, Bridge.</coral-masonry-item>
  <coral-masonry-item data-template-button="blog-post-conclusion-paragraph" coral-wizardview-next=""><h3>Blog Post Conclusion Paragraph</h3>Conclude your blog posts with a captivating ending that leaves a lasting impression on your readers.  </coral-masonry-item>
  <coral-masonry-item data-template-button="blog-post-intro-paragraph" coral-wizardview-next=""><h3>Blog Post Intro Paragraph</h3>Say goodbye to writer's block with our help in crafting an engaging opening paragraph.</coral-masonry-item>
  <coral-masonry-item data-template-button="blog-post-outline" coral-wizardview-next=""><h3>Blog Post Outline</h3>Improve your article writing with lists and outlines.</coral-masonry-item>
  <coral-masonry-item data-template-button="company-bio" coral-wizardview-next=""><h3>Company Bio</h3>Craft an alluring company bio that tells your story in a compelling way.</coral-masonry-item>
  <coral-masonry-item data-template-button="content-improver" coral-wizardview-next=""><h3>Content Improver</h3>Revamp your content with creativity and engagement to make it captivating.</coral-masonry-item>
  <coral-masonry-item data-template-button="simplify" coral-wizardview-next=""><h3>Simplify</h3>Simplify text for effortless comprehension by rephrasing it in an easy-to-read format.</coral-masonry-item>
  <coral-masonry-item data-template-button="faq-generator" coral-wizardview-next=""><h3>FAQ Generator</h3>Conclude your page with informative FAQs that provide valuable insights about your topic.</coral-masonry-item>
  <coral-masonry-item data-template-button="feature-to-benefit" coral-wizardview-next=""><h3>Feature to Benefit</h3>Transform your product features into compelling benefits that drive action.</coral-masonry-item>
  <coral-masonry-item data-template-button="listicle" coral-wizardview-next=""><h3>Listicle</h3>Create a numbered list on any topic of your choice to provide a structured and easily digestible format.</coral-masonry-item>
  <coral-masonry-item data-template-button="one-shot-blog-post" coral-wizardview-next=""><h3>One-Shot Blog Post</h3>Craft a full blog post with intro, body, and conclusion for an engaging read.  </coral-masonry-item>
  <coral-masonry-item data-template-button="perfect-headline" coral-wizardview-next=""><h3>Perfect Headline</h3>Create powerful headlines that convert for your business.  </coral-masonry-item>
  <coral-masonry-item data-template-button="persuasive-bullet-points" coral-wizardview-next=""><h3>Persuasive Bullet Points</h3>Craft compelling bullet points that persuade and capture attention for maximum impact.</coral-masonry-item>
  <coral-masonry-item data-template-button="press-release" coral-wizardview-next=""><h3>Press Release</h3>Keep your audience in the loop with exciting updates and the latest news.  </coral-masonry-item>
  <coral-masonry-item data-template-button="sentence-expander" coral-wizardview-next="" ><h3>Sentence Expander</h3>Transform a short sentence into a rich narrative by expanding it with multiple sentences.</coral-masonry-item>
  </coral-masonry>

      <style type="text/css">
              [data-template-selector] coral-masonry-item {
                border: 1px solid #ccc;
                padding: 10px;
                border-radius: 5px;
                cursor: pointer;
                background: #fff;
              }

              [data-template-selector] coral-masonry-item:hover {
                box-shadow: 0 0 10px #ccc;
              }

              [data-template-selector] coral-masonry-item h3 {
                margin-top: 0;
                margin-bottom: 5px;
              }

              [data-template-panel] h2 {
                margin-bottom: 10px;
              }
      </style>

    </coral-panel>




    <coral-panel>



    <div data-template-panel="free-prompt" hidden>
    <h2>Free prompt</h2>

    <div class="coral-Form coral-Form--vertical">
      <div class="coral-Form-fieldwrapper">
        <label
          class="coral-Form-fieldlabel"
          id="free-prompt-content-label"
          for="free-prompt-content">
          Enter your prompt here, be as descriptive as possible
        </label>
        <textarea
          is="coral-textarea"
          data-template-field="free-prompt-content"
          class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
          id="free-prompt-content"
          labelledby="free-prompt-content-label"
          rows="10"></textarea>
      </div>
    </div>
</div>



      <div data-template-panel="content-summarizer" hidden>
              <h2>Content Summarizer</h2>

              <div class="coral-Form coral-Form--vertical">
                <div class="coral-Form-fieldwrapper">
                  <label
                    class="coral-Form-fieldlabel"
                    id="content-summarizer-content-label"
                    for="content-summarizer-content">
                    Content
                  </label>
                  <textarea
                    is="coral-textarea"
                    data-template-field="content-summarizer-content"
                    class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                    id="content-summarizer-content"
                    labelledby="content-summarizer-content-label"
                    rows="10"></textarea>
                </div>

                <div class="coral-Form-fieldwrapper">
                  <label class="coral-Form-fieldlabel" id="content-summarizer-tone-label">Tone of voice</label>
                  <input
                    is="coral-textfield"
                    data-template-field="content-summarizer-tone"
                    id="content-summarizer-tone"
                    class="coral-Form-field"
                    name="content-summarizer-tone"
                    labelledby="content-summarizer-tone-label">
                </div>
              </div>
      </div>



      <div data-template-panel="aida-framework" hidden>
              <h2>AIDA Framework</h2>

              <div class="coral-Form coral-Form--vertical">
                <div class="coral-Form-fieldwrapper">
                  <label
                    class="coral-Form-fieldlabel"
                    id="aida-framework-company-name-label"
                    for="aida-framework-company-name">
                    Company/Product name
                  </label>
                  <textarea
                    is="coral-textarea"
                    data-template-field="aida-framework-company-name"
                    class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                    id="aida-framework-company-name"
                    labelledby="aida-framework-company-name-label"
                    rows="1"></textarea>
                </div>

                <div class="coral-Form-fieldwrapper">
                  <label
                    class="coral-Form-fieldlabel"
                    id="aida-framework-product-description-label"
                    for="aida-framework-product-description">
                    Product Description
                  </label>
                  <textarea
                    is="coral-textarea"
                    data-template-field="aida-framework-product-description"
                    class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                    id="aida-framework-product-description"
                    labelledby="aida-framework-product-description-label"
                    rows="3"></textarea>
                </div>



                <div class="coral-Form-fieldwrapper">
                  <label class="coral-Form-fieldlabel" id="content-summarizer-tone-label">Tone of voice</label>
                  <input
                    is="coral-textfield"
                    class="coral-Form-field"
                    data-template-field="aida-framework-tone"
                    labelledby="content-summarizer-tone-label">
                </div>
              </div>
      </div>


      <div data-template-panel="bab-framework" hidden>
              <h2>BAB Framework</h2>

              <div class="coral-Form coral-Form--vertical">
                <div class="coral-Form-fieldwrapper">
                  <label
                    class="coral-Form-fieldlabel"
                    id="bab-framework-company-name-label"
                    for="bab-framework-company-name">
                    Company/Product name
                  </label>
                  <textarea
                    is="coral-textarea"
                    data-template-field="bab-framework-company-name"
                    class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                    id="bab-framework-company-name"
                    labelledby="bab-framework-company-name-label"
                    rows="1"></textarea>
                </div>

                <div class="coral-Form-fieldwrapper">
                  <label
                    class="coral-Form-fieldlabel"
                    id="bab-framework-product-description-label"
                    for="bab-framework-product-description">
                    Product Description
                  </label>
                  <textarea
                    is="coral-textarea"
                    data-template-field="bab-framework-product-description"
                    class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                    id="bab-framework-product-description"
                    labelledby="bab-framework-product-description-label"
                    rows="3"></textarea>
                </div>



                <div class="coral-Form-fieldwrapper">
                  <label class="coral-Form-fieldlabel" id="content-summarizer-tone-label">Tone of voice</label>
                  <input
                    is="coral-textfield"
                    class="coral-Form-field"
                    data-template-field="bab-framework-tone"
                    labelledby="content-summarizer-tone-label">
                </div>
              </div>
      </div>

      <div data-template-panel="blog-post-conclusion-paragraph" hidden>
          <h2>Blog Post Conclusion Paragraph</h2>

          <div class="coral-Form coral-Form--vertical">
            <div class="coral-Form-fieldwrapper">
              <label
                class="coral-Form-fieldlabel"
                id="blog-post-conclusion-paragraph-outline-label"
                for="blog-post-conclusion-paragraph-outline">
                What are the main points or outline of your blog post?
              </label>
              <textarea
                is="coral-textarea"
                data-template-field="blog-post-conclusion-paragraph-outline"
                class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                id="blog-post-conclusion-paragraph-outline"
                labelledby="blog-post-conclusion-paragraph-outline-label"
                rows="4"></textarea>
            </div>

            <div class="coral-Form-fieldwrapper">
              <label class="coral-Form-fieldlabel" id="blog-post-conclusion-paragraph-cta-label">Call to action</label>
                <input
                  is="coral-textfield"
                  class="coral-Form-field"
                  data-template-field="blog-post-conclusion-paragraph-cta"
                  labelledby="blog-post-conclusion-paragraph-cta-label">
            </div>


            <div class="coral-Form-fieldwrapper">
              <label class="coral-Form-fieldlabel" id="blog-post-conclusion-paragraph-tone-label">Tone of voice</label>
              <input
                is="coral-textfield"
                class="coral-Form-field"
                data-template-field="blog-post-conclusion-paragraph-tone"
                labelledby="blog-post-conclusion-paragraph-label">
            </div>
          </div>
    </div>


    <div data-template-panel="blog-post-intro-paragraph" hidden>
    <h2>Blog Post Intro Paragraph</h2>

    <div class="coral-Form coral-Form--vertical">

    <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="blog-post-intro-paragraph-title-label">Blog post title</label>
        <input
          is="coral-textfield"
          class="coral-Form-field"
          data-template-field="blog-post-intro-paragraph-title"
          labelledby="blog-post-intro-paragraph-title-label">
    </div>

    <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="blog-post-intro-paragraph-audience-label">Audience</label>
        <input
          is="coral-textfield"
          class="coral-Form-field"
          data-template-field="blog-post-intro-paragraph-audience"
          labelledby="blog-post-intro-paragraph-audience-label">
    </div>


      <div class="coral-Form-fieldwrapper">
        <label class="coral-Form-fieldlabel" id="blog-post-intro-paragraph-tone-label">Tone of voice</label>
        <input
          is="coral-textfield"
          class="coral-Form-field"
          data-template-field="blog-post-intro-paragraph-tone"
          labelledby="blog-post-intro-paragraph-label">
      </div>
    </div>
</div>




<div data-template-panel="blog-post-outline" hidden>
<h2>Blog Post Outline</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
<label class="coral-Form-fieldlabel" id="blog-post-outline-title-label">Blog post title/topic</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="blog-post-outline-title"
      labelledby="blog-post-outline-title-label">
</div>

  <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="blog-post-outline-tone-label">Tone of voice</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="blog-post-outline-tone"
      labelledby="blog-post-outline-label">
  </div>
</div>
</div>



<div data-template-panel="company-bio" hidden>
<h2>Company Bio</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
<label class="coral-Form-fieldlabel" id="company-bio-name-label">Company name</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="company-bio-name"
      labelledby="company-bio-name-label">
</div>
  <div class="coral-Form-fieldwrapper">
              <label
                class="coral-Form-fieldlabel"
                id="company-bio-info-label"
                for="company-bio-info">
                Company information
              </label>
              <textarea
                is="coral-textarea"
                data-template-field="company-bio-info"
                class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                id="company-bio-info"
                labelledby="company-bio-info-label"
                rows="4"></textarea>
            </div>

  <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="company-bio-tone-label">Tone of voice</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="company-bio-tone"
      labelledby="company-bio-tone-label">
  </div>
</div>
</div>



<div data-template-panel="content-improver" hidden>
<h2>Content improver</h2>

<div class="coral-Form coral-Form--vertical">

  <div class="coral-Form-fieldwrapper">
              <label
                class="coral-Form-fieldlabel"
                id="content-improver-content-label"
                for="content-improver-content">
                Content
              </label>
              <textarea
                is="coral-textarea"
                data-template-field="content-improver-content"
                class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                id="content-improver-content"
                labelledby="content-improver-content-label"
                rows="4"></textarea>
            </div>

  <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="content-improver-tone-label">Tone of voice</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="content-improver-tone"
      labelledby="content-improver-tone-label">
  </div>
</div>
</div>


<div data-template-panel="simplify" hidden>
<h2>Simplify</h2>

<div class="coral-Form coral-Form--vertical">

  <div class="coral-Form-fieldwrapper">
              <label
                class="coral-Form-fieldlabel"
                id="simplify-content-label"
                for="simplify-content">
                Content
              </label>
              <textarea
                is="coral-textarea"
                data-template-field="simplify-content"
                class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
                id="simplify-content"
                labelledby="simplify-content-label"
                rows="4"></textarea>
            </div>

  <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="simplify-grade-level-label">Grade level</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="simplify-grade-level"
      labelledby="simplify-grade-level-label" value="8">
  </div>
</div>
</div>


<div data-template-panel="faq-generator" hidden>
<h2>FAQ Generator</h2>

<div class="coral-Form coral-Form--vertical">

  <div class="coral-Form-fieldwrapper">
              <label
                class="coral-Form-fieldlabel"
                id="faq-generator-topic-label"
                for="faq-generator-topic">
                Topic
              </label>
              <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="faq-generator-topic"
      labelledby="faq-generator-topic-label">
            </div>

  <div class="coral-Form-fieldwrapper">
    <label class="coral-Form-fieldlabel" id="faq-number-of-questions-label">Number of questions</label>
    <input
      is="coral-textfield"
      class="coral-Form-field"
      data-template-field="faq-generator-number-of-questions"
      labelledby="faq-generator-number-of-questions-label" value="8">
  </div>

  <div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="faq-generator-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="faq-generator-tone"
    labelledby="faq-generator-tone-label">
</div>

</div>
</div>


<div data-template-panel="feature-to-benefit" hidden>
<h2>Feature to benefit</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
<label
  class="coral-Form-fieldlabel"
  id="feature-to-benefit-description-label"
  for="feature-to-benefit-description">
  Product description
</label>
<textarea
  is="coral-textarea"
  data-template-field="feature-to-benefit-description"
  class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
  id="feature-to-benefit-description"
  labelledby="feature-to-benefit-description-label"
  rows="4"></textarea>
</div>

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="feature-to-benefit-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="feature-to-benefit-tone"
    labelledby="feature-to-benefit-tone-label">
</div>

</div>
</div>

<div data-template-panel="listicle" hidden>
<h2>Listicle</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="listicle-topic-label">Topic</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="listicle-topic"
    labelledby="listicle-topic-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="listicle-list-count-label">List items</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="listicle-list-count"
    labelledby="listicle-list-count-label" value="8">
</div>

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="listicle-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="listicle-tone"
    labelledby="listicle-tone-label">
</div>

</div>
</div>


<div data-template-panel="one-shot-blog-post" hidden>
<h2>One shot blog post</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="one-shot-blog-post-topic-label">Topic</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="one-shot-blog-post-topic"
    labelledby="one-shot-blog-post-topic-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="one-shot-blog-post-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="one-shot-blog-post-tone"
    labelledby="one-shot-blog-post-tone-label">
</div>

</div>
</div>



<div data-template-panel="press-release" hidden>
<h2>Press release</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="press-release-topic-label">Topic</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="press-release-topic"
    labelledby="press-release-topic-label">
</div>


<div class="coral-Form-fieldwrapper">
<label
  class="coral-Form-fieldlabel"
  id="press-release-points-label"
  for="press-release-points">
  Points
</label>
<textarea
  is="coral-textarea"
  data-template-field="press-release-points"
  class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
  id="press-release-points"
  labelledby="press-release-points-label"
  rows="4"></textarea>
</div>


</div>
</div>


<div data-template-panel="sentence-expander" hidden>
<h2>Sentence expander</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="sentence-expander-sentence-label">Sentence</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="sentence-expander-sentence"
    labelledby="sentence-expander-sentence-label">
</div>

<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="sentence-expander-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="sentence-expander-tone"
    labelledby="sentence-expander-tone-label">
</div>

</div>
</div>




<div data-template-panel="perfect-headline" hidden>
<h2>Perfect headline</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
<label
  class="coral-Form-fieldlabel"
  id="perfect-headline-product-description-label"
  for="perfect-headline-product-description">
  Product description
</label>
<textarea
  is="coral-textarea"
  data-template-field="perfect-headline-product-description"
  class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
  id="perfect-headline-product-description"
  labelledby="perfect-headline-product-description-label"
  rows="4"></textarea>
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-company-product-name-label">Company / Product name</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-company-product-name"
    labelledby="perfect-headline-company-product-name-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-customer-avatar-label">Customer avatar</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-customer-avatar"
    labelledby="perfect-headline-customer-avatar-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-customer-problem-label">Customer problem</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-customer-problem"
    labelledby="perfect-headline-customer-problem-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-tone"
    labelledby="perfect-headline-tone-label">
</div>

</div>
</div>


<div data-template-panel="persuasive-bullet-points" hidden>
<h2>Persuasive bullet points</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
<label
  class="coral-Form-fieldlabel"
  id="persuasive-bullet-points-product-description-label"
  for="persuasive-bullet-points-product-description">
  Product description
</label>
<textarea
  is="coral-textarea"
  data-template-field="persuasive-bullet-points-product-description"
  class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
  id="persuasive-bullet-points-product-description"
  labelledby="persuasive-bullet-points-product-description-label"
  rows="4"></textarea>
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="persuasive-bullet-points-company-product-name-label">Company / Product name</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="persuasive-bullet-points-company-product-name"
    labelledby="persuasive-bullet-points-company-product-name-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="persuasive-bullet-points-product-description-label">Product description</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="persuasive-bullet-points-product-description"
    labelledby="persuasive-bullet-points-product-description-label">
</div>



<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="persuasive-bullet-points-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="persuasive-bullet-points-tone"
    labelledby="persuasive-bullet-points-tone-label">
</div>

</div>
</div>



<div data-template-panel="perfect-headline" hidden>
<h2>Perfect headline</h2>

<div class="coral-Form coral-Form--vertical">

<div class="coral-Form-fieldwrapper">
<label
  class="coral-Form-fieldlabel"
  id="perfect-headline-product-description-label"
  for="perfect-headline-product-description">
  Product description
</label>
<textarea
  is="coral-textarea"
  data-template-field="perfect-headline-product-description"
  class="coral-Form-field coral3-Textfield coral3-Textfield--multiline"
  id="perfect-headline-product-description"
  labelledby="perfect-headline-product-description-label"
  rows="4"></textarea>
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-company-product-name-label">Company / Product name</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-company-product-name"
    labelledby="perfect-headline-company-product-name-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-customer-avatar-label">Customer avatar</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-customer-avatar"
    labelledby="perfect-headline-customer-avatar-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-customer-problem-label">Customer problem</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-customer-problem"
    labelledby="perfect-headline-customer-problem-label">
</div>


<div class="coral-Form-fieldwrapper">
  <label class="coral-Form-fieldlabel" id="perfect-headline-tone-label">Tone of voice</label>
  <input
    is="coral-textfield"
    class="coral-Form-field"
    data-template-field="perfect-headline-tone"
    labelledby="perfect-headline-tone-label">
</div>

</div>
</div>







              <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">

      <button data-template-generate-content-button is="coral-button" variant="primary" coral-wizardview-next="" style="float: right;">
      Generate content
    </button>
      <button is="coral-button" variant="default" style="margin-left: 0;" coral-wizardview-previous="">
        Back
      </button>

    </div>
    </coral-panel>


    <coral-panel>
    <div class="coral-Form-fieldwrapper">

    <div
      data-template-field="review-content"
      style="width: auto; height: 400px; overflow-y: auto; background: #fff;  margin-bottom: 16px; display: flex;
      flex-direction: column; border: 1px solid #ccc; font-size: 16px;line-height: 1.5rem;
      padding: 10px 15px;
      box-shadow: inset rgba(0,0,0,0.1) 0px 1px 4px;"></div>


  </div>
  <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">

      <button is="coral-button" variant="default" coral-wizardview-previous="">
        Back
      </button>
      <button data-template-save-button is="coral-button" variant="primary" style="float: right;">
        Save content
      </button>
      </div>

    </coral-panel>

  </coral-panelstack>
</coral-wizardview>

            </coral-panel-content>
          </coral-panel>

          <coral-panel
            class="coral3-Panel"
            id="coral-id-tab2-${path}"
            aria-labelledby="tab2-${path}"
            role="tabpanel"
            aria-hidden="true">
            <coral-panel-content>


            <coral-actionbar>

            <coral-actionbar-item>
              <button id="generate-from-page-content" is="coral-button" variant="primary">Proof read</button>
            </coral-actionbar-item>
            <coral-actionbar-item>
              <button id="create-outline-from-page-content" is="coral-button" variant="primary">Summarize</button>
            </coral-actionbar-item>
            <coral-actionbar-item>
            <button id="create-outline-from-page-content" is="coral-button" variant="primary">Make longer</button>
          </coral-actionbar-item>
          <coral-actionbar-item>
          <button id="create-outline-from-page-content" is="coral-button" variant="primary">Make shorter</button>
          </coral-actionbar-item>
          <coral-actionbar-item>
          <button id="create-outline-from-page-content" is="coral-button" variant="primary">Simplify</button>
          </coral-actionbar-item>
          <coral-actionbar-item>
              <button id="generate-from-page-title" variant="primary" is="coral-button">Improve SEO</button>
            </coral-actionbar-item>

            </coral-actionbar-container>
          </coral-actionbar>

<style type="text/css">
.ql-editor:focus-visible {
  outline: none;
}</style>
            <div

            data-template-field="edit-content"
            style="width: auto; height: 400px; overflow-y: auto; background: #fff; margin-top: -4px; margin-bottom: 16px; display: flex; flex-direction: column; border: 1px solid #ccc; font-size: 16px;
            line-height: 1.5rem;
            padding: 10px 15px;
            box-shadow: inset rgba(0,0,0,0.1) 0px 1px 4px"
            >
            </div>


      <button data-edit-save-button is="coral-button" variant="primary"  style="float: right;">
      Save
    </button>
      <button data-edit-revert-button is="coral-button" variant="default" style="margin-left: 0;">
        Revert
      </button>



              <style type="text/css">
                [id^="aiContentDialog-"] .coral3-Dialog-wrapper {
                width: 750px !important;
                margin-left: -350px !important;
                }
              </style>
            </coral-panel-content>
          </coral-panel>

          <coral-panel
            class="coral3-Panel"
            id="coral-id-tab4-${path}"
            aria-labelledby="tab4-${path}
            role="tabpanel"
            aria-hidden="true">
            <coral-panel-content>
              <form class="coral-Form coral-Form--vertical">
                <div class="coral-Form-fieldwrapper">
                  <label class="coral-Form-fieldlabel" id="label-vertical-textarea-0" for="translate">Translate into</label>
                  <coral-select id="targetLanguage" name="targetLanguage" placeholder="Select a language">
                    <coral-select-item>
                      English
                    </coral-select-item>
                    <coral-select-item>
                      French
                    </coral-select-item>
                    <coral-select-item>
                      Italian
                    </coral-select-item>
                    <coral-select-item>
                      German
                    </coral-select-item>
                  </coral-select>
                </div>
              </form>
              <button style="margin-top: 15px;"
                data-ai-primary
                is="coral-button"
                variant="primary"
                id="translate">
              Translate
              </button>
            </coral-panel-content>
          </coral-panel>

          <coral-panel
          class="coral3-Panel"
          id="coral-id-tab3-${path}"
          aria-labelledby="tab3-${path}"
          role="tabpanel"
          aria-hidden="true"
          >
          <coral-panel-content>
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

      </coral-panel-content>
      </coral-panel>

        </coral-panelstack>
      </coral-tabview>
      </div>
              `
      },
      footer: {
        innerHTML: ''
      }
    });

    var tabs = dialog.content.querySelector("[data-ai-tabs]");
    var loader = dialog.content.querySelector("#gpt-loader");
    var footer = dialog.footer;

    // get template selector
    var templateSelector = dialog.content.querySelector("[data-template-selector]");
    var activeTemplate;
    $(templateSelector).on('click', 'coral-masonry-item', function(e) {
      // get the data-template-button attribute of this
      var templateToShow = this.getAttribute('data-template-button');
      activeTemplate = templateToShow;
      // find data-template-panel=templateToShow
      var panelToShow = dialog.content.querySelector(`[data-template-panel="${templateToShow}"]`);

      // set hidden attribute on all data-template-panel elements
      var panels = dialog.content.querySelectorAll("[data-template-panel]");
      panels.forEach(function(panel) {
        panel.setAttribute('hidden', '');
      });

      // show the panel
      panelToShow.removeAttribute('hidden');
    });


       // get the current content
       $.ajax({
        url: `${editable.path}.json`,
        type: 'GET',

        success: function (res) {
          dialog.querySelector('[data-template-field="edit-content"]').innerHTML = res.text;


          var options = {

          };
          var editor = new Quill('[data-template-field="edit-content"]', options);


        },
        error: function (request, error) {
          console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
        }
      });

    // attach click event to data-template-save-button
    var saveButton = dialog.content.querySelector("[data-template-save-button]");
    saveButton.addEventListener('click', function(e) {
      // get the content from the review-content div
      var content = dialog.content.querySelector("[data-template-field='review-content']").innerHTML;
      // save the content
      $.ajax({
        url: `${editable.path}.html`,
        type: 'POST',
        data: {
          './text': content,
          './textIsRich': 'true'
        },
        success: function (res) {
          editable.refresh();
          clearTemplateFields();
          dialog.hide();
        },
        error: function (request, error) {
          console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
        }
      });
    });


    // attach click event to data-template-save-button
    var editorSaveButton = dialog.content.querySelector("[data-edit-save-button]");
    editorSaveButton.addEventListener('click', function(e) {
      // get the content from the review-content div
      var content = dialog.content.querySelector("[data-template-field='edit-content']").innerHTML;
      // save the content
      $.ajax({
        url: `${editable.path}.html`,
        type: 'POST',
        data: {
          './text': content,
          './textIsRich': 'true'
        },
        success: function (res) {
          editable.refresh();
          clearTemplateFields();
          dialog.hide();
        },
        error: function (request, error) {
          console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
        }
      });
    });




    // attach click event to data-template-generate-content-button
    var generateContentButton = dialog.content.querySelector("[data-template-generate-content-button]");
    generateContentButton.addEventListener('click', function(e) {
      const prompt = generateTemplatePrompt(activeTemplate);
      requestTemplatePrompt(prompt);
    });

    function populateForReview(content) {
      var reviewContent = dialog.content.querySelector("[data-template-field='review-content']");
      reviewContent.innerHTML = content;
    }

    // write a function to clear all data-template-field values
    function clearTemplateFields() {
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


    function generateTemplatePrompt(templateId) {
      const promptGuide = `Please respond in JSON format. Put the response into the data key of the response. Respond inside that value as HTML without divs and h2 instead of h1 elements.  Use h2, h3, h4 as appropriate for headings. Use <p> elements for paragraphs. Here is the prompt to use: `
      switch (templateId) {
        case 'free-prompt':
          // get the fields for content summarizer
          var content = encodeURIComponent(dialog.content.querySelector("[data-template-field='free-prompt-content']").value);
          prompt = `${content}`;
        break;
        case 'content-summarizer':
          // get the fields for content summarizer
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='content-summarizer-tone']").value);
          prompt = `Summarize the following content in a ${tone} tone: "${content}".`;
        break;
        case 'aida-framework':
          var companyName = encodeURIComponent(dialog.content.querySelector("[data-template-field='aida-framework-company-name']").value);
          var product = encodeURIComponent(dialog.content.querySelector("[data-template-field='aida-framework-product-description']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='aida-framework-tone']").value);

          prompt = `Never mention the AIDA framework. Write content using the AIDA framework, without mentioning that you are using the AIDA framework - don't mention anything about attenion, etc. with the following properties: Company Name: ${companyName}, Product: ${product}, Tone: ${tone}.`;
        break;
        case 'bab-framework':
          var companyName = encodeURIComponent(dialog.content.querySelector("[data-template-field='bab-framework-company-name']").value);
          var product = encodeURIComponent(dialog.content.querySelector("[data-template-field='bab-framework-product-description']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='bab-framework-tone']").value);

          prompt = `Write content using the BAB (Before-After-Bridge) framework with the following properties: Company Name: ${companyName}, Product: ${product}, Tone: ${tone}.`;
        break;
        case 'blog-post-conclusion-paragraph':
          var outline = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-conclusion-paragraph-outline']").value);
          var cta = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-conclusion-paragraph-cta']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-conclusion-paragraph-tone']").value);

          prompt = `Write a conclusion paragraph for the following blog post using this post outline: ${outline}. Include a call to action: ${cta}. Use this tone of voice: ${tone}.`;
        break;
        case 'blog-post-intro-paragraph':
          var title = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-intro-paragraph-title']").value);
          var audience = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-intro-paragraph-audience']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-intro-paragraph-tone']").value);
          prompt = `Write an introduction paragraph for the following blog post title: ${title}. The audience is ${audience}. Use this tone of voice: ${tone}.`;
        break;
        case 'blog-post-outline':
          var title = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-outline-title']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-outline-tone']").value);
          prompt = `Write an outline for the following blog post title: ${title}. Use this tone of voice: ${tone}.`;
        break;
        case 'company-bio':
          var name = encodeURIComponent(dialog.content.querySelector("[data-template-field='company-bio-name']").value);
          var info = encodeURIComponent(dialog.content.querySelector("[data-template-field='company-bio-info']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='company-bio-tone']").value);
          prompt = `Write a company bio for the following company name: ${name}. Company info: ${info}. Use this tone of voice: ${tone}.`;
        break;
        case 'content-improver':
          var content = encodeURIComponent(dialog.content.querySelector("[data-template-field='content-improver-content']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='content-improver-tone']").value);
          prompt = `Improve the following content: ${content}. Use this tone of voice: ${tone}.`;
        break;
        case 'simplify':
          var content = encodeURIComponent(dialog.content.querySelector("[data-template-field='simplify-content']").value);
          var gradeLevel = encodeURIComponent(dialog.content.querySelector("[data-template-field='simplify-grade-level']").value);
          prompt = `Explain the following content to a child at grade level ${gradeLevel}: ${content}.`;
          break;
        case 'faq-generator':
          var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='faq-generator-topic']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='faq-generator-tone']").value);
          var numQuestions = encodeURIComponent(dialog.content.querySelector("[data-template-field='faq-generator-number-of-questions']").value);
          prompt = `Write ${numQuestions} FAQs for the following topic: ${topic}. Use this tone of voice: ${tone}.`;
          break;
        case 'feature-to-benefit':
          var description = encodeURIComponent(dialog.content.querySelector("[data-template-field='feature-to-benefit-description']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='feature-to-benefit-tone']").value);
          prompt = `Write the benefits of the features of this product description: ${description}. Use this tone of voice: ${tone}.`;
        break;
        case 'listicle':
          var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='listicle-topic']").value);
          var listCount = encodeURIComponent(dialog.content.querySelector("[data-template-field='listicle-list-count']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='listicle-tone']").value);
          prompt = `Write a listicle for the following topic: ${topic}. The list should have ${listCount} items. Use this tone of voice: ${tone}.`;
        break;
        case 'one-shot-blog-post':
          var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='one-shot-blog-post-topic']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='one-shot-blog-post-tone']").value);
          prompt = `Write a one-shot blog post for the following topic: ${topic}. Use this tone of voice: ${tone}.`;
        break;
        case 'perfect-headline':
          var productDescription = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-product-description']").value);
          var companyProductName = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-company-product-name']").value);
          var customerAvatar = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-customer-avatar']").value);
          var customerProblem = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-customer-problem']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-tone']").value);
          prompt = `Write a perfect headline for the following product description: ${productDescription}. The company product name is ${companyProductName}. The customer avatar is ${customerAvatar}. The customer problem is ${customerProblem}. Use this tone of voice: ${tone}.`;
        break;
        case 'persuasive-bullet-points':
          var companyProductName = encodeURIComponent(dialog.content.querySelector("[data-template-field='persuasive-bullet-points-company-product-name']").value);
          var productDescription = encodeURIComponent(dialog.content.querySelector("[data-template-field='persuasive-bullet-points-product-description']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='persuasive-bullet-points-tone']").value);
          prompt = `Write persuasive bullet points for the following content: Company/Product Name: ${companyProductName}, Product Description: ${productDescription}, Tone: ${tone}.`;
        break;
        case 'press-release':
          var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='press-release-topic']").value);
          var points = encodeURIComponent(dialog.content.querySelector("[data-template-field='press-release-points']").value);
          prompt = `Write a press release for the following topic: ${topic}. The press release should have ${points} points.`;
        break;
        case 'sentence-expander':
          var sentence = encodeURIComponent(dialog.content.querySelector("[data-template-field='sentence-expander-sentence']").value);
          var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='sentence-expander-tone']").value);
          prompt = `Expand the following sentence: ${sentence}. Use this tone of voice: ${tone}.`;
        break;
      }

      return promptGuide + prompt;
    }

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
      xhr.setRequestHeader('Authorization', 'Bearer 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');
      xhr.responseType = 'blob';
      xhr.onload = function() {
        if (xhr.status === 200) {
          loader.hidden = true;
          tabs.hidden = false;
          footer.hidden = false;

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
              textContent: 'An error has occured.'
            },
            duration: 3000,
            type: 'error',
          });
          toast.style.width = '318px';
          toast.show();
          console.log('Request: ' + JSON.stringify(xhr) + '\n' + 'Error: ' + JSON.stringify(xhr.statusText));
        }
      };
      xhr.send(JSON.stringify({'inputs': prompt, 'wait_for_model': true}));
    }

    // add event listener to save-to-dam to save the image source to dam
    dialog.content.querySelector('#save-to-dam').addEventListener('click', function () {
      const prompt = dialog.content.querySelector("#image-prompt").value;

      const targetUrl = `/api/assets/aemgpt/*`;
      const blob = new Blob([dialog.content.querySelector('#image-holder').getAttribute('src')], {type: 'image/png'});


    });

    // add event listener to download-image to download the image source
    dialog.content.querySelector('#download-image').addEventListener('click', function () {
      var image = dialog.content.querySelector('#image-holder').getAttribute('src');
      var link = document.createElement('a');
      link.download = 'image.png';
      link.href = image;
      link.click();
    });

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

        var options = {

        };
        var editor = new Quill('[data-template-field="review-content"]', options);


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

    function requestPrompt(prompt) {
      loader.hidden = false;
      tabs.hidden = true;
      footer.hidden = true;

      prompt = prompt.trim();
      var servletUrl = `/bin/chat?prompt=${prompt}`;
      var xhr = new XMLHttpRequest();
      xhr.open("GET", servletUrl);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
          $.ajax({
            url: editable.path,
            type: 'POST',
            data: {
              './text': xhr.responseText,
              './textIsRich': 'true'
            },
            success: function (res) {
              console.log(res);
              editable.refresh();
              dialog.hide();
              loader.hidden = true;
              tabs.hidden = false;
              footer.hidden = false;
            },
            error: function (request, error) {
              const toast = new Coral.Toast().set({
                content: {
                  textContent: 'An error has occured.'
                },
                duration: 3000,
                type: 'error',
              });
              toast.style.width = '318px';
              toast.show();
              console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
            }
          });
        }
      };
      xhr.send();
    }

    // // Quick Summary
    // dialog.content.querySelector("#quick-summary").addEventListener("click", function () {
    //   $.ajax({
    //     url: `${editable.path}.json`,
    //     type: 'GET',

    //     success: function (res) {
    //       currentContent = res.text;
    //       var prompt = `Please provide a brief summary of this content: ${encodeURIComponent(currentContent)}`
    //   requestPrompt(prompt);
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });
    // });

    // // Translate
    // dialog.content.querySelector("#translate").addEventListener("click", function () {
    //   // get the current content
    //   $.ajax({
    //     url: `${editable.path}.json`,
    //     type: 'GET',

    //     success: function (res) {
    //       currentContent = res.text;
    //       var targetLanguage = dialog.content.querySelector("#targetLanguage").value;
    //       var prompt = `Translate the following text into ${targetLanguage}: ${encodeURIComponent(currentContent)}. Retain any existing HTML elements present in the content. Only modify the text.`;
    //       requestPrompt(prompt);
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });

    // });

    // // Rewrite
    // dialog.content.querySelector("#rewrite-generate").addEventListener("click", function () {
    //    // get the current content
    //    $.ajax({
    //     url: `${editable.path}.json`,
    //     type: 'GET',

    //     success: function (res) {
    //       currentContent = res.text;
    //       var rewriteType = dialog.content.querySelector("#rewriteType").value;
    //       var prompt = `Respond in semantic HTML format without divs and h2 instead of h1 elements.  Use h2, h3, h4 as appropriate for headings. You are impersonating a ${encodeURIComponent(rewriteType)}. Rewrite this content as if you were them, keeping the same length: ${encodeURIComponent(currentContent)}`;
    //       requestPrompt(prompt);
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });

    // });


    // // Convert to list
    // dialog.content.querySelector("#convert-to-list").addEventListener("click", function () {
    //   // get the current content
    //   $.ajax({
    //     url: `${editable.path}.json`,
    //     type: 'GET',

    //     success: function (res) {
    //       currentContent = res.text;
    //       var prompt = `Please convert this content into a HTML list: ${encodeURIComponent(currentContent)}.`;
    //       requestPrompt(prompt);
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });
    // });


    // // Generate from page title
    // dialog.content.querySelector("#generate-from-page-title").addEventListener("click", function () {
    //   var pageContents = document.querySelector("#ContentFrame").contentDocument.documentElement;
    //   var title = pageContents.querySelector("title").innerHTML;

    //   var prompt = `You are a copywriter, writing content for this website. Do not mention yourself. Create 4 paragraphs of content based on this page title: ${encodeURIComponent(title)} Always respond in semantic HTML format without divs and h2 instead of h1 elements.  Use h2, h3, h4 as appropriate for headings. Use <p> elements for paragraphs.`;
    //   requestPrompt(prompt);
    // });

    // // Convert to list
    // dialog.content.querySelector("#convert-to-list").addEventListener("click", function () {
    //   // get the current content
    //   $.ajax({
    //     url: `${editable.path}.json`,
    //     type: 'GET',

    //     success: function (res) {
    //       currentContent = res.text;
    //       var prompt = `Please convert this content into a HTML list: ${encodeURIComponent(currentContent)}.`;
    //       requestPrompt(prompt);
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });
    // });



    // // Generate from page content
    // dialog.content.querySelector("#generate-from-page-content").addEventListener("click", function (e) {
    //   var pageContents = document.querySelector("#ContentFrame").contentDocument.documentElement;
    //   var mainElement = pageContents.querySelector("main");
    //   var headings = mainElement.querySelectorAll("h1, h2, h3, h4, h5, h6");
    //   var paragraphs = mainElement.querySelectorAll("p");
    //   var title = pageContents.querySelector("title").innerHTML;
    //   var pageText = title + " ";
    //   for (var i = 0; i < headings.length; i++) {
    //     pageText += headings[i].innerText + " ";
    //   }
    //   for (var i = 0; i < paragraphs.length; i++) {
    //     pageText += paragraphs[i].innerText + " ";
    //   }
    //   var prompt = `You are a copywriter, writing content for this website. Do not mention yourself. Create 4 paragraphs of content based on this page text: ${encodeURIComponent(pageText)} Always respond in semantic HTML format without divs and h2 instead of h1 elements.  Use h2, h3, h4 as appropriate for headings. Use <p> elements for paragraphs.`;
    //   requestPrompt(prompt);
    // });

    function getElementContents() {
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

    // // Quick Polish
    // dialog.content.querySelector("#quick-polish").addEventListener("click", function () {
    //   // get the current content
    //   $.ajax({
    //     url: `${editable.path}.json`,
    //     type: 'GET',

    //     success: function (res) {
    //       currentContent = res.text;

    //       // escape res.text
    //       var escapedContent = encodeURIComponent(currentContent);

    //       var prompt = `Correct any spelling or grammatical mistakes in the following content. Do not change any language unless absolutely needed to correct mistakes. Content: ${encodeURIComponent(escapedContent)} Always respond in semantic HTML format without divs and h2 instead of h1 elements. Use h2, h3, h4 as appropriate for headings. Use <p> elements for paragraphs.`;
    //       requestPrompt(prompt);
    //     },
    //     error: function (request, error) {
    //       console.log("Request: " + JSON.stringify(request) + "\n" + "Error: " + JSON.stringify(error));
    //     }
    //   });

    // });




    // Open the dialog
    document.body.appendChild(dialog);
    dialog.show();
  }
}(jQuery, Granite.author, jQuery(document), this, Coral));


