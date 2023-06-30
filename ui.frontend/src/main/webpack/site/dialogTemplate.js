/* eslint-disable max-len */
function dialogTemplate(path) {
    return `
    <div data-opax-dialog>
        <div id="gpt-loader" hidden>
            <coral-wait size="L" variant="dots" centered></coral-wait>
            <p>Preparing your content...</p>
        </div>
        <coral-tabview data-ai-tabs class="coral3-TabView">
            <coral-tablist
                target="#tabPanel"
                size="S"
                class="coral3-TabList"
                orientation="horizontal"
                role="tablist"
                id="coral-tablist-${path}"
                aria-multiselectable="false">
                <coral-tab
                    data-write-tab
                    id="tab0-${path}"
                    aria-controls="coral-id-tab0-${path}"
                    class="coral3-Tab is-selected"
                    role="tab"
                    aria-selected="true"
                    selected>
                    <coral-tab-label>Write</coral-tab-label>
                </coral-tab>
                <coral-tab
                    data-edit-tab
                    id="tab1-${path}"
                    aria-controls="coral-id-tab1-${path}"
                    class="coral3-Tab"
                    role="tab"
                    >
                    <coral-tab-label>Edit</coral-tab-label>
                </coral-tab>
                <coral-tab
                    data-translate-tab
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
                            <coral-steplist coral-wizardview-steplist="">
                                <coral-step>Select template</coral-step>
                                <coral-step>Configure</coral-step>
                                <coral-step>Review</coral-step>
                            </coral-steplist>
                            <coral-panelstack coral-wizardview-panelstack="">
                                <coral-panel>
                                    <coral-masonry data-template-selector layout="variable" spacing="10" columnwidth="250">
                                        <coral-masonry-item data-template-button="free-prompt" coral-wizardview-next="">
                                            <h3>Free prompt</h3>
                                            Write a prompt to generate the perfect copy
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="content-summarizer" coral-wizardview-next="">
                                            <h3>Content Summarizer</h3>
                                            Uncover the essential nuggets of information from a piece of content by extracting the key bullet points.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="aida-framework" coral-wizardview-next="">
                                            <h3>AIDA Framework</h3>
                                            Elevate your persuasive skills by implementing the time-tested Attention, Interest, Desire, Action framework.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="bab-framework" coral-wizardview-next="">
                                            <h3>Before-After-Bridge Framework</h3>
                                            Write effective marketing copy with the BAB framework: Before, After, Bridge.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="blog-post-conclusion-paragraph" coral-wizardview-next="">
                                            <h3>Blog Post Conclusion Paragraph</h3>
                                            Conclude your blog posts with a captivating ending that leaves a lasting impression on your readers.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="blog-post-intro-paragraph" coral-wizardview-next="">
                                            <h3>Blog Post Intro Paragraph</h3>
                                            Say goodbye to writer's block with our help in crafting an engaging opening paragraph.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="blog-post-outline" coral-wizardview-next="">
                                            <h3>Blog Post Outline</h3>
                                            Improve your article writing with lists and outlines.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="company-bio" coral-wizardview-next="">
                                            <h3>Company Bio</h3>
                                            Craft an alluring company bio that tells your story in a compelling way.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="content-improver" coral-wizardview-next="">
                                            <h3>Content Improver</h3>
                                            Revamp your content with creativity and engagement to make it captivating.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="simplify" coral-wizardview-next="">
                                            <h3>Simplify</h3>
                                            Simplify text for effortless comprehension by rephrasing it in an easy-to-read format.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="faq-generator" coral-wizardview-next="">
                                            <h3>FAQ Generator</h3>
                                            Conclude your page with informative FAQs that provide valuable insights about your topic.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="feature-to-benefit" coral-wizardview-next="">
                                            <h3>Feature to Benefit</h3>
                                            Transform your product features into compelling benefits that drive action.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="listicle" coral-wizardview-next="">
                                            <h3>Listicle</h3>
                                            Create a numbered list on any topic of your choice to provide a structured and easily digestible format.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="one-shot-blog-post" coral-wizardview-next="">
                                            <h3>One-Shot Blog Post</h3>
                                            Craft a full blog post with intro, body, and conclusion for an engaging read.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="perfect-headline" coral-wizardview-next="">
                                            <h3>Perfect Headline</h3>
                                            Create powerful headlines that convert for your business.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="persuasive-bullet-points" coral-wizardview-next="">
                                            <h3>Persuasive Bullet Points</h3>
                                            Craft compelling bullet points that persuade and capture attention for maximum impact.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="press-release" coral-wizardview-next="">
                                            <h3>Press Release</h3>
                                            Keep your audience in the loop with exciting updates and the latest news.
                                        </coral-masonry-item>
                                        <coral-masonry-item data-template-button="sentence-expander" coral-wizardview-next="" >
                                            <h3>Sentence Expander</h3>
                                            Transform a short sentence into a rich narrative by expanding it with multiple sentences.
                                        </coral-masonry-item>
                                    </coral-masonry>
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
                                            data-editor-container
                                            data-template-field="review-content"></div>
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
                                <button data-edit-action-proof-read is="coral-button" variant="primary">Proof read</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-summarize is="coral-button" variant="primary">Summarize</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-seo variant="primary" is="coral-button">Improve SEO</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-readability variant="primary" is="coral-button">Improve readability</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-clarity variant="primary" is="coral-button">Improve clarity</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-grammar variant="primary" is="coral-button">Improve grammar</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-tone variant="primary" is="coral-button">Improve tone</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-structure variant="primary" is="coral-button">Improve structure</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-improve-flow variant="primary" is="coral-button">Improve flow</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-make-shorter is="coral-button" variant="primary">Make shorter</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-make-longer is="coral-button" variant="primary">Make longer</button>
                            </coral-actionbar-item>
                            <coral-actionbar-item>
                                <button data-edit-action-simplify is="coral-button" variant="primary">Simplify</button>
                            </coral-actionbar-item>

                            </coral-actionbar-container>
                        </coral-actionbar>
                        <div
                            data-editor-container
                            data-edit-editor>
                        </div>
                        <button data-edit-save-button is="coral-button" variant="primary"  style="float: right;">
                        Save
                        </button>

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
                                <coral-select data-edit-translate-targetlang name="targetLanguage" placeholder="Select a language">
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
                            data-edit-action-translate >
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
                        <div data-image-target style="" id="targetComponent">
                            <img data-image-container id="image-holder" />
                        </div>
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
`;
}




export { dialogTemplate };
