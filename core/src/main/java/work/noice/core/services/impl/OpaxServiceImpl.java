package work.noice.core.services.impl;

import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.metatype.annotations.Designate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import work.noice.core.services.OpaxConfiguration;
import work.noice.core.services.OpaxService;

/**
 * @author Anirudh Sharma
 *         <p>
 *         Implementation class of OpaxService interface and this class reads
 *         values from the OSGi configuration as well
 */
@Component(service = OpaxService.class, immediate = true)
@Designate(ocd = OpaxConfiguration.class)
public class OpaxServiceImpl implements OpaxService {

    /**
     * Logger
     */
    private static final Logger log = LoggerFactory.getLogger(OpaxServiceImpl.class);

    /**
     * Instance of the OSGi configuration class
     */
    private boolean toolbarEnabled;
    private String opaxApiKey;
    private String[] components;
    private String openAIAPIKey;

    @Activate
    protected void activate(OpaxConfiguration configuration) {
        toolbarEnabled = configuration.getToolbarEnabled();
        components = configuration.getComponents();
        openAIAPIKey = configuration.getOpenAIAPIKey();
    }

    @Override
    public String getOpenAIAPIKey() {
        return openAIAPIKey;
    }

    @Override
    public boolean getToolbarEnabled() {
        return toolbarEnabled;
    }

    @Override
    public String[] getComponents() {
        return components;
    }
}