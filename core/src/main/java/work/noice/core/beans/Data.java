package work.noice.core.beans;

import java.util.Map;

public class Data {

    private String templateId;
    private Map<String, String> dataAttributes;

    public String getTemplateId() {
        return templateId;
    }

    public Map<String, String> getDataAttributes() {
        return dataAttributes;
    }

    public void setDataAttributes(Map<String, String> dataAttributes) {
        this.dataAttributes = dataAttributes;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;


    }
}
