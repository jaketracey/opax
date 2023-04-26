package work.noice.core.services.impl;

import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.metatype.annotations.Designate;
import work.noice.core.services.OpaxConfiguration;
import work.noice.core.services.OpaxService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @author Anirudh Sharma
 *
 * Implementation class of OpaxService interface and this class reads values from the OSGi configuration as well
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
	private OpaxConfiguration configuration;

	@Activate
	protected void activate(OpaxConfiguration configuration) {
		this.configuration = configuration;
	}

	/**
	 * Overridden method of the HttpService
	 */
	@Override
	public String getOpenAIAPIKey() {

		log.info("----------< Reading the config values >----------");

		try {

			/**
			 * Reading values from the configuration
			 */
			boolean enable = configuration.getToolbarEnabled();
			String openAIKey = configuration.getOpenAIAPIKey();
			String opaxKey = configuration.getOpaxApiKey();
			String[] components = configuration.getComponents();

			/**
			 * Constructing the URL
			 */
			String configs = enable + " // " + openAIKey + " // " + opaxKey + " // " + components;
			log.info("----------< CONFIG VALUES ARE >----------");
			log.info(configs);

			/**
			 * Make HTTP call only if "enable" is true
			 */
			if (enable) {
				/**
				 * Making the actual HTTP call
				 */

				/**
				 * Printing the response in the logs
				 */
				log.info("----------< TOOLBAR ENABLED >----------");

				return openAIKey;
			} else {

				log.info("----------< Configuration is not enabled >----------");

				return "Configuration not enabled";
			}

		} catch (Exception e) {

			log.error(e.getMessage(), e);

			return "Error occurred" + e.getMessage();
		}
	}

}