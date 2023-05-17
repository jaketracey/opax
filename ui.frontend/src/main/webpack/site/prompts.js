function generateTemplatePrompt(templateId, dialog) {
    switch (templateId) {
        case 'free-prompt':
            // get the fields for content summarizer
            var content = encodeURIComponent(dialog.content.querySelector("[data-template-field='free-prompt-content']").value);
            prompt = { "templateId": templateId, "dataAttributes": { "content": content } };
            break;
        case 'content-summarizer':
            // get the fields for content summarizer
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='content-summarizer-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "tone": tone } };

            break;
        case 'aida-framework':
            var companyName = encodeURIComponent(dialog.content.querySelector("[data-template-field='aida-framework-company-name']").value);
            var product = encodeURIComponent(dialog.content.querySelector("[data-template-field='aida-framework-product-description']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='aida-framework-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "companyName": companyName, "product": product, "tone": tone } };
            break;
        case 'bab-framework':
            var companyName = encodeURIComponent(dialog.content.querySelector("[data-template-field='bab-framework-company-name']").value);
            var product = encodeURIComponent(dialog.content.querySelector("[data-template-field='bab-framework-product-description']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='bab-framework-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "companyName": companyName, "product": product, "tone": tone } };
            break;
        case 'blog-post-conclusion-paragraph':
            var outline = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-conclusion-paragraph-outline']").value);
            var cta = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-conclusion-paragraph-cta']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-conclusion-paragraph-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "outline": outline, "cta": cta, "tone": tone } };
            break;
        case 'blog-post-intro-paragraph':
            var title = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-intro-paragraph-title']").value);
            var audience = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-intro-paragraph-audience']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-intro-paragraph-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "title": title, "audience": audience, "tone": tone } };
            break;
        case 'blog-post-outline':
            var title = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-outline-title']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='blog-post-outline-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "title": title, "tone": tone } };
            break;
        case 'company-bio':
            var name = encodeURIComponent(dialog.content.querySelector("[data-template-field='company-bio-name']").value);
            var info = encodeURIComponent(dialog.content.querySelector("[data-template-field='company-bio-info']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='company-bio-tone']").value);
            prompt = { "templateId": templateId, "dataAttributes": { "name": name, "info": info, "tone": tone } };
            break;
        case 'content-improver':
            var content = encodeURIComponent(dialog.content.querySelector("[data-template-field='content-improver-content']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='content-improver-tone']").value);
            prompt = { "templateId": templateId, "dataAttributes": { "content": content, "tone": tone } };
            break;
        case 'simplify':
            var content = encodeURIComponent(dialog.content.querySelector("[data-template-field='simplify-content']").value);
            var gradeLevel = encodeURIComponent(dialog.content.querySelector("[data-template-field='simplify-grade-level']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "content": content, "gradeLevel": gradeLevel } };
            break;
        case 'faq-generator':
            var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='faq-generator-topic']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='faq-generator-tone']").value);
            var numQuestions = encodeURIComponent(dialog.content.querySelector("[data-template-field='faq-generator-number-of-questions']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "topic": topic, "tone": tone, "numQuestions": numQuestions } };
            break;
        case 'feature-to-benefit':
            var description = encodeURIComponent(dialog.content.querySelector("[data-template-field='feature-to-benefit-description']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='feature-to-benefit-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "description": description, "tone": tone } };
            break;
        case 'listicle':
            var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='listicle-topic']").value);
            var listCount = encodeURIComponent(dialog.content.querySelector("[data-template-field='listicle-list-count']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='listicle-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "topic": topic, "tone": tone, "listCount": listCount } };
            break;
        case 'one-shot-blog-post':
            var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='one-shot-blog-post-topic']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='one-shot-blog-post-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "topic": topic, "tone": tone } };
            break;
        case 'perfect-headline':
            var productDescription = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-product-description']").value);
            var companyProductName = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-company-product-name']").value);
            var customerAvatar = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-customer-avatar']").value);
            var customerProblem = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-customer-problem']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='perfect-headline-tone']").value);

            prompt = { "templateId": templateId, "dataAttributes": { "productDescription": productDescription, "companyProductName": companyProductName, "customerAvatar": customerAvatar, "customerProblem": customerProblem, "tone": tone } };
            break;
        case 'persuasive-bullet-points':
            var companyProductName = encodeURIComponent(dialog.content.querySelector("[data-template-field='persuasive-bullet-points-company-product-name']").value);
            var productDescription = encodeURIComponent(dialog.content.querySelector("[data-template-field='persuasive-bullet-points-product-description']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='persuasive-bullet-points-tone']").value);
            prompt = { "templateId": templateId, "dataAttributes": { "productDescription": productDescription, "companyProductName": companyProductName, "tone": tone } };
            break;
        case 'press-release':
            var topic = encodeURIComponent(dialog.content.querySelector("[data-template-field='press-release-topic']").value);
            var points = encodeURIComponent(dialog.content.querySelector("[data-template-field='press-release-points']").value);
            prompt = { "templateId": templateId, "dataAttributes": { "topic": topic, "points": points } };
            break;
        case 'sentence-expander':
            var sentence = encodeURIComponent(dialog.content.querySelector("[data-template-field='sentence-expander-sentence']").value);
            var tone = encodeURIComponent(dialog.content.querySelector("[data-template-field='sentence-expander-tone']").value);
            prompt = { "templateId": templateId, "dataAttributes": { "sentence": sentence, "tone": tone } };
            break;
    }

    return prompt;
}

export { generateTemplatePrompt };
