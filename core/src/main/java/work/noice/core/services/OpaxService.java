package work.noice.core.services;

public interface OpaxService {
    boolean getToolbarEnabled();

    String[] getComponents();

    String getOpaxApiKey();

    String getOpenAIAPIKey();
}
