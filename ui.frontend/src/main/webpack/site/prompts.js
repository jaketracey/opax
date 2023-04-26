function generateTemplatePrompt(templateId, dialog) {
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

export { generateTemplatePrompt };
