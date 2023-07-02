# Opax

Opax is a powerful integration tool that brings the capabilities of OpenAI's GPT into Adobe Experience Manager (AEM). It leverages AEM's robust content management features and combines them with the versatility and power of GPT, allowing for a sophisticated, AI-driven user experience.

https://github.com/jaketracey/opaxai/assets/146648/46e4debb-d5a6-4c13-8480-4616fed33e37

The extension attaches to any instance of the v2 wcm text component, but you can modify it to your needs.

## Features

- Integration with OpenAI's GPT completions API
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

```
mvn clean install -PautoInstallPackage
```

## Configuration

1. Navigate to AEM system console configuration (`http://<aem-host>:<aem-port>/system/console/configMgr`)
2. Search for "Opax AI Configuration"
3. Enter your OpenAI API key
4. Save changes

## Usage
After successful installation and configuration, the AI generation capability will be available on any instance of the WCM V2 Text component. You can extend this functionality to work with other components by editing the source code.

## License
This project is licensed under the MIT License - see the [LICENSE](https://github.com/jaketracey/opaxai/blob/main/LICENSE) file for details.

## Support
For any questions, support, or issues, please create a new issue in the Github repository.

## Disclaimer
This tool uses the OpenAI GPT model and therefore any responses it generates are subject to OpenAI's usage policies. The developers of this tool are not responsible for the generated content.

## Acknowledgements
- Adobe, for the AEM content management system.
- OpenAI, for the GPT model.
- Albin Issac, for his inspirational [post](https://techforum.medium.com/how-to-connect-adobe-experience-manager-aem-with-chatgpt-312651291713) and initial code upon which this extension was based. Connect with Albin on [LinkedIn](https://www.linkedin.com/in/albin-issac-56917523/).
- Dipankar Gupta for his guidance in navigating OSGI configurations :)

---

Developed with :heart: by Opax team.
