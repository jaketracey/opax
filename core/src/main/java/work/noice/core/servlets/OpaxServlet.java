package work.noice.core.servlets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.text.StringEscapeUtils;
import org.apache.http.HttpResponse;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.api.SlingHttpServletResponse;
import org.apache.sling.api.servlets.HttpConstants;
import org.apache.sling.api.servlets.SlingAllMethodsServlet;
import org.osgi.framework.Constants;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import work.noice.core.beans.ChatGptRequest;
import work.noice.core.beans.ChatGptResponse;
import work.noice.core.beans.Data;
import work.noice.core.services.OpaxService;

import javax.servlet.Servlet;
import java.io.IOException;

@Component(immediate = true, service = Servlet.class, property = {
        Constants.SERVICE_DESCRIPTION + "=ChatGPT Integration",
        "sling.servlet.methods=" + HttpConstants.METHOD_POST,
        "sling.servlet.paths=" + "/bin/chat",
        "sling.servlet.extensions={\"json\"}"
})
public class OpaxServlet extends SlingAllMethodsServlet {

    private static final Logger Logger = LoggerFactory.getLogger(OpaxServlet.class);

    private static final String CHATGPT_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

    private static final HttpClient client = HttpClients.createDefault();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Reference
    private transient OpaxService config;

    @Override
    protected void doPost(SlingHttpServletRequest request, SlingHttpServletResponse response) throws IOException {
        String body = IOUtils.toString(request.getReader());
        String key = config.getOpenAIAPIKey();

        // return an error if key is not found
        if (StringUtils.isBlank(key)) {
            response.setStatus(400);
            response.getWriter().write("Open AI API Key not found");
            return;
        }

        if (StringUtils.isNotBlank(body)) {
            String prompt = generatePrompt(body);
            if (StringUtils.isNotBlank(prompt)) {
                String result = generateMessage(prompt);
                if (StringUtils.isNotBlank(result)) {
                    JsonObject jsonObject = new JsonObject();
                    jsonObject.addProperty("data", StringEscapeUtils.escapeHtml4(result));
                    response.setStatus(200);
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write(jsonObject.toString());
                } else {
                    response.setStatus(400);
                    response.getWriter().write("error");
                }
            } else {
                response.setStatus(400);
                response.getWriter().write("error");
            }
        } else {
            response.setStatus(400);
            response.getWriter().write("error");
        }
    }

    private String generateMessage(String prompt) throws IOException {

        String requestBody = MAPPER.writeValueAsString(new ChatGptRequest(prompt, "gpt-3.5-turbo", "user"));
        HttpPost request = new HttpPost(CHATGPT_API_ENDPOINT);
        request.addHeader("Authorization", "Bearer" + " " + config.getOpenAIAPIKey());

        request.addHeader("Content-Type", "application/json");
        request.setEntity(new StringEntity(requestBody, "UTF-8"));
        HttpResponse response = client.execute(request);

        ChatGptResponse chatGptResponse = MAPPER.readValue(EntityUtils.toString(response.getEntity(), "UTF-8"),
                ChatGptResponse.class);
        String message = chatGptResponse.getChoices().get(0).getMessage().getContent();

        return message;
    }

    private String generatePrompt(String data) {

        Gson gson = new Gson();
        Data jsonData = gson.fromJson(data, Data.class);
        String content = jsonData.getDataAttributes().get("content");
        String tone = jsonData.getDataAttributes().get("tone");
        String companyName = jsonData.getDataAttributes().get("companyName");
        String product = jsonData.getDataAttributes().get("product");
        String outline = jsonData.getDataAttributes().get("outline");
        String cta = jsonData.getDataAttributes().get("cta");
        String title = jsonData.getDataAttributes().get("title");
        String audience = jsonData.getDataAttributes().get("audience");
        String name = jsonData.getDataAttributes().get("name");
        String info = jsonData.getDataAttributes().get("info");
        String gradeLevel = jsonData.getDataAttributes().get("gradeLevel");
        String numQuestions = jsonData.getDataAttributes().get("numQuestions");
        String description = jsonData.getDataAttributes().get("description");
        String topic = jsonData.getDataAttributes().get("topic");
        String listCount = jsonData.getDataAttributes().get("listCount");
        String productDescription = jsonData.getDataAttributes().get("productDescription");
        String companyProductName = jsonData.getDataAttributes().get("companyProductName");
        String customerAvatar = jsonData.getDataAttributes().get("customerAvatar");
        String customerProblem = jsonData.getDataAttributes().get("customerProblem");
        String points = jsonData.getDataAttributes().get("points");
        String sentence = jsonData.getDataAttributes().get("sentence");
        String language = jsonData.getDataAttributes().get("language");

        String promptGuide = "You are a copywriter AI that can write and edit existing content. You always respond in HTML format for consumption by a rich text editor. Your goal is to produce the content that is requested as instructed without ever identifying yourself or the changes you have made. It should only ever contain content that was requested:  PROMPT: ";

        switch (jsonData.getTemplateId()) {
            case "free-prompt":
                return promptGuide + content;
            case "content-summarizer":
                return promptGuide + "Summarize the following content in a " + tone + "tone: " + content;
            case "aida-framework":
                return promptGuide
                        + "Never mention the AIDA framework. Write content using the AIDA framework, without mentioning that you are using the AIDA framework - don't mention anything about attention, etc. with the following properties: Company Name: "
                        + companyName + ", Product: " + product + ", Tone: " + tone + ".";
            case "bab-framework":
                return promptGuide
                        + "Write content using the BAB (Before-After-Bridge) framework with the following properties: Company Name: "
                        + companyName + ", Product: " + product + ", Tone: " + tone + ".";
            case "blog-post-conclusion-paragraph":
                return promptGuide
                        + "Write a conclusion paragraph for the following blog post using this post outline: " + outline
                        + ". Include a call to action: " + cta + ". Use this tone of voice: " + tone + ".";
            case "blog-post-intro-paragraph":
                return promptGuide + "Write an introduction paragraph for the following blog post title: " + title
                        + ". The audience is " + audience + ". Use this tone of voice: " + tone + ".";
            case "blog-post-outline":
                return promptGuide + "Write an outline for the following blog post title: " + title
                        + ". Use this tone of voice: " + tone + ".";
            case "company-bio":
                return promptGuide + "Write a company bio for the following company name: " + name + ". Company info: "
                        + info + ". Use this tone of voice: " + tone + ".";
            case "content-improver":
                return promptGuide + "Improve the following content: " + content + ". Use this tone of voice: " + tone
                        + ".";
            case "simplify":
                return promptGuide + "Explain the following content to a child at grade level " + gradeLevel + ": "
                        + content + ".";
            case "faq-generator":
                return promptGuide + "Write " + numQuestions + " FAQs for the following topic: " + topic
                        + ". Use this tone of voice: " + tone + ".";
            case "feature-to-benefit":
                return promptGuide + "Write the benefits of the features of this product description: " + description
                        + ". Use this tone of voice: " + tone + ".";
            case "listicle":
                return promptGuide + "Write a listicle for the following topic: " + topic + ". The list should have "
                        + listCount + " items. Use this tone of voice: " + tone + ".";
            case "one-shot-blog-post":
                return promptGuide + "Write a one-shot blog post for the following topic: " + topic
                        + ". Use this tone of voice: " + tone + ".";
            case "perfect-headline":
                return promptGuide + "Write a perfect headline for the following product description: "
                        + productDescription + ". The company product name is " + companyProductName
                        + ". The customer avatar is " + customerAvatar + ". The customer problem is " + customerProblem
                        + ". Use this tone of voice: " + tone + ".";
            case "persuasive-bullet-points":
                return promptGuide + "Write persuasive bullet points for the following content: Company/Product Name: "
                        + companyProductName + ", Product Description: " + productDescription + ", Tone: " + tone + ".";
            case "press-release":
                return promptGuide + "Write a press release for the following topic: " + topic
                        + ". The press release should have " + points + " points.";
            case "sentence-expander":
                return promptGuide + "Expand the following sentence: " + sentence + ". Use this tone of voice: " + tone
                        + ".";
            case "proof-read":
                return promptGuide + "Proofread the following content: " + content + ".";
            case "summarize":
                return promptGuide + "Summarize the following content: " + content + ".";
            case "improve-seo":
                return promptGuide + "Improve the SEO of the following content: " + content + ".";
            case "improve-readability":
                return promptGuide + "Improve the readability of the following content: " + content + ".";
            case "improve-clarity":
                return promptGuide + "Improve the clarity of the following content: " + content + ".";
            case "improve-grammar":
                return promptGuide + "Improve the grammar of the following content: " + content + ".";
            case "improve-tone":
                return promptGuide + "Improve the tone of the following content: " + content + ".";
            case "improve-structure":
                return promptGuide + "Improve the structure of the following content: " + content + ".";
            case "improve-flow":
                return promptGuide + "Improve the flow of the following content: " + content + ".";
            case "translate":
                return promptGuide + "Translate the following content into " + language + ": " + content + ".";
        }
        return "";
    }
}
