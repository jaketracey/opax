package work.noice.core.impl;

import org.apache.sling.settings.SlingSettingsService;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.ConfigurationPolicy;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.metatype.annotations.Designate;

import work.noice.core.OpaxConfiguration;
import work.noice.core.services.OpaxService;

@Component(service = OpaxService.class, configurationPolicy = ConfigurationPolicy.REQUIRE)
@Designate(ocd = OpaxConfiguration.class)
public class OpaxServiceImpl implements OpaxService {

    private OpaxConfiguration config;

    private boolean author;

    @Reference
    private SlingSettingsService settings;

    @Activate
    public void activate(OpaxConfiguration config) {
        this.config = config;
        author = settings.getRunModes().contains("author");
    }


    public boolean enableConfig() {
        return config.enableConfig();
    }


    public String[] getComponents() {
        return config.getComponents();
    }

    public String getOpenAIAPIKey() {
        return config.getOpenAIAPIKey();
    }


    public String getOpaxApiKey() {
        return config.getOpaxApiKey();
    }

    public boolean isAuthor() {
        return author;
    }

}
