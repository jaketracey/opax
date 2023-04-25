package work.noice.core.servlets;

import javax.servlet.Servlet;
import javax.servlet.ServletException;
import java.io.IOException;
import java.util.logging.Logger;
import java.util.ArrayList;
import java.util.List;

import org.apache.sling.api.servlets.SlingSafeMethodsServlet;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.api.SlingHttpServletResponse;
import org.apache.sling.api.servlets.HttpConstants;
import org.osgi.framework.Constants;

import work.noice.core.beans.ChatGptRequest;
import work.noice.core.beans.ChatGptResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.http.HttpResponse;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;

import work.noice.core.services.OpaxService;
import work.noice.core.impl.OpaxServiceImpl;

@Component(
    immediate = true,
    service = Servlet.class,
    property = {
        Constants.SERVICE_DESCRIPTION + "=Opax Servlet",
        "sling.servlet.methods=" + HttpConstants.METHOD_GET,
        "sling.servlet.paths=" + "/bin/chat",
        "sling.servlet.extensions={\"json\"}"
    }
)
public class OpaxServlet extends SlingSafeMethodsServlet {

    private static final Logger LOGGER = Logger.getLogger(OpaxServlet.class.getName());

    private static final String CHATGPT_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

    public static final OpaxService opaxService = new OpaxServiceImpl();
    private static final String OPEN_AI_APIKEY = opaxService.getOpenAIAPIKey();

    private static final HttpClient client = HttpClients.createDefault();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    protected void doGet(SlingHttpServletRequest request, SlingHttpServletResponse response) throws ServletException, IOException {
        String prompt = request.getParameter("prompt");
        String message = generateMessage(prompt);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(message);
    }

    private static String generateMessage(String prompt) throws IOException {

            // Generate the chat message using ChatGPT API
            String requestBody = MAPPER.writeValueAsString(new ChatGptRequest(prompt,"gpt-3.5-turbo","user"));
            HttpPost request = new HttpPost(CHATGPT_API_ENDPOINT);
            System.out.println("OpenAI API Key: "+OPEN_AI_APIKEY);
            request.addHeader("Authorization", "Bearer "+OPEN_AI_APIKEY);
            //request.addHeader("Authorization", "Bearer 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");
            request.addHeader("Content-Type", "application/json");
            request.setEntity(new StringEntity(requestBody, "UTF-8"));
            System.out.println("requestBody: "+requestBody);
            HttpResponse response = client.execute(request);
            System.out.println("response: "+response);

            ChatGptResponse chatGptResponse = MAPPER.readValue(EntityUtils.toString(response.getEntity(), "UTF-8"), ChatGptResponse.class);
            System.out.println("response: "+chatGptResponse);

            String message = chatGptResponse.getChoices().get(0).getMessage().getContent();
            System.out.println("response: "+chatGptResponse);

            return message;     

    }

        
    public static void main(String[] args) {
        try {
            System.out.println(generateMessage("What is Adobe AEM"));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
}

