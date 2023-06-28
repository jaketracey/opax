package work.noice.core.services;

import org.osgi.service.metatype.annotations.AttributeDefinition;
import org.osgi.service.metatype.annotations.AttributeType;
import org.osgi.service.metatype.annotations.ObjectClassDefinition;

/**
 * @author Jake Tracey
 *         <p>
 *         This interface represents an OSGi configuration which can be found at
 *         -
 *         ./system/console/configMgr
 */
@ObjectClassDefinition(name = "Opax - Configuration", description = "Configure the Opax AI integration with AEM")
public @interface OpaxConfiguration {

    /**
     * This is a checkbox property which will indicate of the configuration is
     * executed or not
     *
     * @return {@link Boolean}
     */
    @AttributeDefinition(name = "Enable toolbar", description = "This property indicates whether the toolbar will display or not", type = AttributeType.BOOLEAN)
    boolean getToolbarEnabled();

    /**
     * Returns the component path where the AI toolbar will be injected
     *
     * @return {@link String}
     */
    @AttributeDefinition(name = "Components to inject the AI toolbar", description = "Enter the specific component path where you wish the AI toolbar to be injected. For example, /apps/core/wcm/components/text/v2/text")
    String[] getComponents();

    /**
     * Returns the Open AI API key
     *
     * @return {@link String}
     */
    @AttributeDefinition(name = "Open AI API Key", description = "Enter your API key. You can generate a key from https://beta.openai.com/account/api-keys")
    String getOpenAIAPIKey();
}