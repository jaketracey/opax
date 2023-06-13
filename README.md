# Opax AI

Opax AI is a powerful integration tool that brings the capabilities of OpenAI's ChatGPT into Adobe Experience Manager (AEM). It leverages AEM's robust content management features and combines them with the versatility and power of ChatGPT, allowing for a sophisticated, AI-driven user experience.

The extension attaches to any instance of the v2 wcm text component, but you can modify it to your needs.

## Features

- Integration with OpenAI's ChatGPT API
- Dynamic content generation
- Rich text editing of AI responses
- Quick editing tools
- Extendable prompts for additional use cases
- Usable with Adobe Cloud and 6.5 applications

## Pre-requisites

- AEM 6.5 or higher / Adobe Cloud
- Java 8 or higher
- Maven 3.3.9 or higher
- OpenAI API key

## Installation

Before installation, ensure you meet all the pre-requisites.

1. Clone the repository
2. Navigate to the project directory
3. Install the project

``` mvn clean install -PautoInstallPackage


## Configuration

1. Navigate to AEM system console configuration (`http://<aem-host>:<aem-port>/system/console/configMgr`)
2. Search for "Opax AI Configuration"
3. Enter your OpenAI API key
4. Save changes

## Usage
After successful installation and configuration, the ChatGPT functionality will be available as a component in AEM. You can add this component to your pages and it will interact with the users dynamically.

## Contributing
Please read [CONTRIBUTING.md](https://github.com/your-repository/Opax-AI/blob/main/CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## License
This project is licensed under the MIT License - see the [LICENSE.md](https://github.com/your-repository/Opax-AI/blob/main/LICENSE.md) file for details.

## Support
For any questions, support, or issues, please create a new issue in the Github repository.

## Disclaimer
This tool uses the OpenAI GPT model and therefore any responses it generates are subject to OpenAI's usage policies. The developers of this tool are not responsible for the generated content.

## Acknowledgements
- Adobe, for the AEM content management system.
- OpenAI, for the GPT model.
- Albin Issac, for his inspirational [post](https://techforum.medium.com/how-to-connect-adobe-experience-manager-aem-with-chatgpt-312651291713) and initial code upon which this extension was based. Connect with Albin on [LinkedIn](https://www.linkedin.com/in/albin-issac-56917523/).

---

Developed with :heart: by Opax AI Team.