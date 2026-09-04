# Loop 1 — key-speech relevance and data

## Method and acceptance bar

Each report now runs eight real subject sub-questions through `/find` at `top_k=20`, constrained to `kind/speech`, the report topic label and real text fields. Candidates are rejected by named, unit-tested predicates for placeholder/transcript titles, short or procedural bodies, missing or procedural briefs, and briefs that do not name the subject. The remaining pool is scored by reranked retrieval score × `log(text length)` × role evidence, then greedily spread across years and parliaments with one speech per speaker. The selector stops at six once no uncovered sub-question remains instead of padding a list with weak material.

The first pass was rejected because it still admitted generic Documents/Ministerial Statements rows, an unrelated cognate-bill brief and false role matches. The accepted pass raises the body floor to 1,500 characters, rejects procedural summary language, never backfills a missing party from historically ambiguous person data, and requires at least two parliaments. Kevin Rudd’s own 2008 apology resource is not eligible because `da-summary-t-body` is absent; the 2008 Senate apology debate is the strongest eligible apology record with a brief.

## Climate & Energy (7)

### Renewable Energy Amendment (Increased Mandatory Renewable Energy Target) Bill 2008

- Speaker: Christine Milne (Greens)
- Date and parliament: 2008-11-27; Federal
- Brief: The speaker introduced the Renewable Energy Amendment (Increased Mandatory Renewable Energy Target) Bill 2008 to increase the Mandatory Renewable Energy Target from 9,500 GWh to 45,000 GWh, aiming for 20% renewable electricity by 2020, and criticised the Rudd Government for failing to legislate its election promise.
- Why it belongs: Second reading, Renewable Energy Amendment (Increased Mandatory Renewable Energy Target)…, 2008; substantive record (9,578 characters), with a subject-specific machine brief.

### Carbon Pollution Reduction Scheme Bills 2009

- Speaker: Ursula Stephens (not labelled in the resource)
- Date and parliament: 2009-11-18; Federal
- Brief: The government argued the Carbon Pollution Reduction Scheme would reduce emissions, create jobs, and drive investment, citing Treasury modelling of 1.7 million jobs by 2020 and $19 billion in renewables; opponents including the Coalition and Greens criticized the bill for risking job losses (e.g., 66,000 in mining), harming trade-exposed industries, and failing to achieve meaningful global emissions reductions without a comprehensive international agreement.
- Why it belongs: Carbon Pollution Reduction Scheme Bills 2009, Federal, 2009; substantive record (337,679 characters), with a subject-specific machine brief.

### United Nations Climate Change Conference

- Speaker: Jeremy Buckingham (not labelled in the resource)
- Date and parliament: 2015-10-27; NSW
- Brief: The speaker argued for a moratorium on all new coalmines and extensions in New South Wales, stating that 95% of Australia’s coal reserves must remain unburned to limit global warming to two degrees; he noted that 41 new mines or extensions have been approved since 2011 and 10,000 coal jobs lost in the Hunter Valley.
- Why it belongs: United Nations Climate Change Conference, NSW, 2015; substantive record (4,943 characters), with a subject-specific machine brief.

### National Energy Guarantee

- Speaker: David Clarke (not labelled in the resource)
- Date and parliament: 2018-08-15; NSW
- Brief: The COAG Energy Council agreed to progress the National Energy Guarantee, with draft legislation released for consultation, expected to bring forward 1,000 megawatts of new generation and save households around $150 annually on electricity bills between 2020 and 2030, aiming for implementation by April 2019.
- Why it belongs: National Energy Guarantee, NSW, 2018; substantive record (3,478 characters), with a subject-specific machine brief.

### Bushfires and Climate Change

- Speaker: David Shoebridge (not labelled in the resource)
- Date and parliament: 2019-11-14; NSW
- Brief: David Shoebridge argued that the government's deletion of all climate change references from the motion was a pattern of gagging experts, citing a directive that banned Department of Environment and Planning staff from discussing the link between climate change and bushfires at the Adapt NSW forum. He stated that bushfires are becoming more common and extreme due to climate change.
- Why it belongs: Bushfires and Climate Change, NSW, 2019; substantive record (4,260 characters), with a subject-specific machine brief.

### Climate Change and Greenhouse Emissions Reduction (Targets) Amendment Bill

- Speaker: D.J. Speirs (not labelled in the resource)
- Date and parliament: 2022-07-06; South Australia
- Brief: The bill legislates net zero emissions by 2050, a 50% reduction by 2030 from 2005 levels, and 100% renewable electricity generation by 2030, enshrining previous Liberal government targets and the state's 2021–2025 climate action plan.
- Why it belongs: Second reading, Climate Change and Greenhouse Emissions Reduction (Targets) Amendment Bill, 2022; substantive record (12,531 characters), with a subject-specific machine brief.

### Safeguard Mechanism reforms

- Speaker: Ted O'Brien (Liberal)
- Date and parliament: 2023-03-08; Federal
- Brief: The coalition opposed the Safeguard Mechanism (Crediting) Amendment Bill 2022, arguing it imposes a hidden carbon tax of $75 per tonne that will raise costs for consumers and force businesses to close, while Labor and Greens speakers supported the bill as necessary to meet Australia's 43% emissions reduction target by 2030 and net zero by 2050.
- Why it belongs: Safeguard Mechanism reforms, Federal, 2023; substantive record (37,179 characters), with a subject-specific machine brief.

## Gambling (7)

### Matters of Public Interest

- Speaker: Kay Patterson (Liberal)
- Date and parliament: 2007-09-19; Federal
- Brief: The speaker argued that Kevin Rudd’s opposition to poker machines lacks substance, as he has no record of action and offered no revenue substitute; the speaker also noted that states receive over $4.7 billion annually in gambling revenue but spend less than 5% on problem gambling services, and that his own push for a national gambling research institute was blocked by Labor state ministers.
- Why it belongs: Matters of Public Interest, Federal, 2007; substantive record (12,043 characters), with a subject-specific machine brief.

### Racing and Gambling Industries

- Speaker: Justin Field (not labelled in the resource)
- Date and parliament: 2018-10-17; NSW
- Brief: The racing and gambling industries exert undue influence on New South Wales politics, exemplified by the Sydney Opera House horse race promotion, a memorandum of understanding with ClubsNSW protecting poker machine profits, and lobbying that exempted the racing industry from gambling advertising reforms.
- Why it belongs: Racing and Gambling Industries, NSW, 2018; substantive record (10,167 characters), with a subject-specific machine brief.

### Gambling Legislation Amendment (Online and Other Betting) Bill 2019

- Speaker: Scott Farlow (not labelled in the resource)
- Date and parliament: 2019-08-07; NSW
- Brief: The Gambling Legislation Amendment (Online and Other Betting) Bill 2019 implements NSW commitments under the National Consumer Protection Framework for Online Wagering, including prohibiting certain inducements, requiring betting providers to offer deposit limits and easy account closure, and clarifying the definition of inducements following a court ruling. The government has also increased penalties for breaches, prosecuted multiple operators, and allocated $35 million in 2019-20 for gambling harm prevention and treatment.
- Why it belongs: Second reading, Gambling Legislation Amendment (Online and Other Betting) Bill 2019, 2019; substantive record (12,853 characters), with a subject-specific machine brief.

### Casino Control Amendment (Inquiries) Bill 2020

- Speaker: Sam Farraway (not labelled in the resource)
- Date and parliament: 2020-08-27; NSW
- Brief: The Casino Control Amendment (Inquiries) Bill 2020 is necessary to ensure the Bergin inquiry can finish quickly, following Melco's court challenge; it provides that privileged information produced under compulsion to the inquiry is inadmissible in court, protecting witnesses and avoiding further legal delays.
- Why it belongs: Casino Control Amendment (Inquiries) Bill 2020, NSW, 2020; substantive record (2,019 characters), with a subject-specific machine brief.

### Gambling Regulation Amendment (Wagering and Betting Tax) Bill 2021 - Second reading

- Speaker: Hamer (not labelled in the resource)
- Date and parliament: 2021-05-20; Victoria
- Brief: The bill increases Victoria's wagering and betting tax from 8% to 10% from 1 July 2021, matching New South Wales, while raising the racing industry's share of tax revenue to 3.5% of net wagering revenue (up from 1.5%), providing an estimated $20 million net annual benefit to Racing Victoria, Harness Racing Victoria and Greyhound Racing Victoria.
- Why it belongs: Second reading, Gambling Regulation Amendment (Wagering and Betting Tax) Bill 2021, 2021; substantive record (9,261 characters), with a subject-specific machine brief.

### Gambling Advertising

- Speaker: Jamie Parker (not labelled in the resource)
- Date and parliament: 2022-10-19; NSW
- Brief: A motion was moved to support a ban on all gambling advertising in New South Wales, citing South Australia’s timed advertising restrictions, a 70 per cent public approval for banning TV gambling ads, and findings that nearly 30 per cent of children aged 12–17 had gambled. The speech argued current regulations are inadequate, noting the gambling industry spent $287.2 million on advertising in 2021.
- Why it belongs: Gambling Advertising, NSW, 2022; substantive record (6,712 characters), with a subject-specific machine brief.

### Gambling Legislation Amendment (Pre-commitment and Carded Play) Bill 2024 - Second reading

- Speaker: Tim Read (not labelled in the resource)
- Date and parliament: 2025-03-19; Victoria
- Brief: The Victorian Greens welcomed the Gambling Legislation Amendment (Pre-commitment and Carded Play) Bill 2024 but criticised its delayed implementation schedule. They argued that mandatory carded play and voluntary daily precommitment limits should be firmly legislated by 2027, not left to ministerial discretion, noting that Victorians lost a record $3 billion to poker machines in 2023–24.
- Why it belongs: Second reading, Gambling Legislation Amendment (Pre-commitment and Carded Play) Bill 2024, 2025; substantive record (4,616 characters), with a subject-specific machine brief.

## Housing (6)

### National Rental Affordability Scheme Bill 2008; National Rental Affordability Scheme (Consequential Amendments) Bill 2008

- Speaker: Marise Payne (not labelled in the resource)
- Date and parliament: 2008-11-24; Federal
- Brief: The speaker argued the National Rental Affordability Scheme would only address a small fraction of the projected 200,000 housing unit shortfall, and raised concerns that its fixed $6,000 annual incentive and rigid parameters may fail to attract institutional investors or deliver a competitive rate of return. The speaker also noted the scheme's tenant eligibility criteria could exclude key workers and that the government had only provided a temporary two-year fix for the charitable status of not-for-profit participants.
- Why it belongs: National Rental Affordability Scheme Bill 2008; National Rental…, Federal, 2008; substantive record (117,878 characters), with a subject-specific machine brief.

### Matters of Public Interest

- Speaker: Scott Ludlam (Greens)
- Date and parliament: 2011-09-21; Federal
- Brief: The speaker argued for a national plan to deliver affordable housing, supporting the Australians for Affordable Housing alliance’s six-point plan, and highlighted a shortfall of 90,000 homes requiring $24 billion, while criticizing the lack of a dedicated housing minister and $50 billion in annual tax concessions that inflate house prices.
- Why it belongs: Matters of Public Interest, Federal, 2011; substantive record (15,342 characters), with a subject-specific machine brief.

### Negative gearing and capital gains tax

- Speaker: Andrew Leigh (Labor)
- Date and parliament: 2016-02-22; Federal
- Brief: Labor argued that negative gearing and capital gains tax discounts disproportionately benefit high-income earners, reduce home ownership, and cost the budget billions, proposing to halve the capital gains tax discount to 25% for new assets from July 2017 and grandfather existing investments. The speaker also criticised the government for scrapping Labor's permanent instant asset write-off and loss carry-back measures, and for failing to progress tax reform.
- Why it belongs: Negative gearing and capital gains tax, Federal, 2016; substantive record (8,773 characters), with a subject-specific machine brief.

### COVID-19 Rental Affordability

- Speaker: R.A. Simms (not labelled in the resource)
- Date and parliament: 2021-05-12; South Australia
- Brief: The motion calls on the Marshall government to extend the eviction moratorium beyond 30 June, waive all COVID-19 rental debt, and introduce permanent rent caps, noting that no rental properties in South Australia are affordable for people on JobSeeker.
- Why it belongs: COVID-19 Rental Affordability, South Australia, 2021; substantive record (5,146 characters), with a subject-specific machine brief.

### Home Ownership

- Speaker: Adam Crouch (not labelled in the resource)
- Date and parliament: 2022-10-18; NSW
- Brief: Premier Dominic Perrottet announced the government's first home buyer choice policy, allowing buyers to opt for an annual land tax instead of upfront stamp duty, and noted over 13,000 people had used the online calculator, with Lakemba being the top electorate of interest.
- Why it belongs: Home Ownership, NSW, 2022; substantive record (4,394 characters), with a subject-specific machine brief.

### Housing Australia Future Fund Bill 2023

- Speaker: Matt Thistlethwaite (Labor)
- Date and parliament: 2023-02-15; Federal
- Brief: The speaker argued that the Housing Australia Future Fund, a $10 billion investment, is needed to build 30,000 social and affordable homes over five years, including 4,000 for women and children fleeing domestic violence, $30 million for veterans at risk of homelessness, and $200 million for remote Indigenous housing, and criticised the previous coalition government for neglecting housing policy.
- Why it belongs: Housing Australia Future Fund Bill 2023, Federal, 2023; substantive record (177,495 characters), with a subject-specific machine brief.

## Immigration (6)

### Australian Citizenship Bill 2005; Australian Citizenship (Transitionals and Consequentials) Bill 2005

- Speaker: Ian Campbell (not labelled in the resource)
- Date and parliament: 2006-11-30; Federal
- Brief: The Australian Citizenship Bill 2005 was introduced to replace the 1948 Act, retaining citizenship as a privilege and adding a four-year lawful residence requirement (including 12 months as a permanent resident), mandatory refusal for security threats, identity verification, and new revocation grounds, with several recommendations from the Senate committee adopted. The companion Australian Citizenship (Transitionals and Consequentials) Bill 2005 implements transitional arrangements, including applying the new residence rules only to future permanent residents and registering adoptions under the Hague Convention.
- Why it belongs: Australian Citizenship Bill 2005; Australian Citizenship (Transitionals…, Federal, 2006; substantive record (7,881 characters), with a subject-specific machine brief.

### MIGRATION AMENDMENT REGULATIONS 2007 (No. 7)

- Speaker: Andrew Bartlett (Australian Democrats)
- Date and parliament: 2007-09-20; Federal
- Brief: Senator Andrew Bartlett moved to disallow four items in the Migration Amendment Regulations 2007 (No. 7), arguing they removed the 15-point family sponsorship concession for skilled migration visa subclass 138, contrary to the Birrell–Hawthorne–Richardson evaluation, and further skewed the migration program away from family reunion. The motion was negatived.
- Why it belongs: MIGRATION AMENDMENT REGULATIONS 2007 (No. 7), Federal, 2007; substantive record (27,223 characters), with a subject-specific machine brief.

### Migration Amendment (Detention Reform and Procedural Fairness) Bill 2010

- Speaker: Sarah Hanson-Young (Greens)
- Date and parliament: 2010-11-18; Federal
- Brief: The Migration Amendment (Detention Reform and Procedural Fairness) Bill 2010 was moved to end offshore processing and excision, make detention a last resort, end indefinite detention, and introduce judicial review of detention beyond 30 days, citing Australia's international obligations and a High Court ruling that asylum seekers on excised territory must receive procedural fairness.
- Why it belongs: Second reading, Migration Amendment (Detention Reform and Procedural Fairness) Bill 2010, 2010; substantive record (6,912 characters), with a subject-specific machine brief.

### The Medevac law

- Speaker: Andrew Giles (Labor)
- Date and parliament: 2019-07-23; Federal
- Brief: Labor opposed the Migration Amendment (Repairing Medical Transfers) Bill 2019, arguing the medevac regime is working and should not be repealed. The speaker cited that around 90 transfers were approved, 20 cases went to the Independent Health Advice Panel, and only seven transfers occurred without ministerial approval, while moving a second reading amendment criticising the Home Affairs Minister for mischaracterising the process.
- Why it belongs: The Medevac law, Federal, 2019; substantive record (23,222 characters), with a subject-specific machine brief.

### Refugee Week

- Speaker: T.T. Ngo (not labelled in the resource)
- Date and parliament: 2022-09-08; South Australia
- Brief: The speaker highlighted the significance of Refugee Week, noting the Labor government's role in ending the Nadesalingam family's trauma and Fatima Payman's election as Australia's first hijab-wearing Muslim senator, while also citing refugee contributions to regional economies and announcing $99.5 million in military assistance to Ukraine.
- Why it belongs: Refugee Week, South Australia, 2022; substantive record (5,693 characters), with a subject-specific machine brief.

### Regulations and Determinations

- Speaker: Clare O'Neil (Labor)
- Date and parliament: 2023-02-07; Federal
- Brief: The minister moved to approve the designation of Nauru as a regional processing country, arguing it is essential to deter people smugglers, prevent deaths at sea, and has bipartisan support and legal assurances.
- Why it belongs: Regulations and Determinations, Federal, 2023; substantive record (62,192 characters), with a subject-specific machine brief.

## First Nations (8)

### Northern Territory Emergency Response Bills

- Speaker: Nigel Scullion (not labelled in the resource)
- Date and parliament: 2007-08-08; Federal
- Brief: The speaker argued that Labor would support the Northern Territory emergency response bills on balance, judging they would improve child safety, while moving an amendment to outline guiding principles including halving Indigenous infant mortality within a decade and eliminating the 17-year life expectancy gap within a generation, and opposing the blanket exemption from the Racial Discrimination Act and the removal of the permit system.
- Why it belongs: Northern Territory Emergency Response Bills, Federal, 2007; substantive record (212,605 characters), with a subject-specific machine brief.

### Apology to Australia’s Indigenous Peoples

- Speaker: Andrew Bartlett (Australian Democrats)
- Date and parliament: 2008-02-13; Federal
- Brief: The speakers supported the apology to the stolen generations, arguing it is a historic first step that must be followed by concrete action to close gaps in health, education, and life expectancy, while several raised concerns about compensation, the Northern Territory intervention, and the need to avoid repeating failed policies.
- Why it belongs: National apology debate, Federal, 2008; substantive record (132,713 characters), with a subject-specific machine brief.

### Native Title Amendment (Reform) Bill 2011

- Speaker: Rachel Siewert (Greens)
- Date and parliament: 2011-03-21; Federal
- Brief: The Native Title Amendment (Reform) Bill 2011 was introduced to address the failure of the Native Title Act to deliver meaningful rights, proposing amendments including a rebuttable presumption of continuity, strengthened good faith negotiation requirements, allowing profit sharing in arbitration, and implementing principles from the UN Declaration on the Rights of Indigenous Peoples.
- Why it belongs: Second reading, Native Title Amendment (Reform) Bill 2011, 2011; substantive record (28,824 characters), with a subject-specific machine brief.

### Constitutional recognition and the Uluru Statement

- Speaker: Linda Burney (Labor)
- Date and parliament: 2017-06-22; Federal
- Brief: The 1967 referendum, which achieved a 90.77% yes vote nationally, is being commemorated alongside the 25th anniversary of the High Court's Mabo decision; the speaker also noted upcoming discussions for a proposed referendum to recognise Aboriginal people in the Australian Constitution, drawing on the Uluru Statement, Patrick Dodson’s expert panel, and a parliamentary committee’s work.
- Why it belongs: Constitutional recognition and the Uluru Statement, Federal, 2017; substantive record (5,079 characters), with a subject-specific machine brief.

### Closing the Gap statement

- Speaker: Sharon Claydon (Labor)
- Date and parliament: 2018-02-14; Federal
- Brief: Progress on Closing the Gap is mixed: child mortality, early childhood education and Year 12 attainment are on track, but literacy, numeracy, employment, life expectancy and school attendance are failing. The speaker argued that failures stem from a lack of genuine partnership with Indigenous communities and community-owned programs, and supported Labor’s initiatives including the Uluru Statement from the Heart, additional targets on incarceration and out-of-home care, and compensation for the stolen generations.
- Why it belongs: Closing the Gap statement, Federal, 2018; substantive record (6,721 characters), with a subject-specific machine brief.

### Summary Offences Amendment (Decriminalisation of Public Drunkenness) Bill 2020 - Second reading

- Speaker: Read (not labelled in the resource)
- Date and parliament: 2021-02-02; Victoria
- Brief: The speaker supported the decriminalisation of public drunkenness bill but criticised the Andrews government for the disproportionate rise in Aboriginal incarceration from 12 to 16 times the rate of non-Indigenous Victorians under its policies. They named Tanya Day’s family, campaigners Belinda Stevens, Apryl Watson, Warren Stevens and Kimberly Watson, and cited 434 Aboriginal deaths in custody since the 1991 royal commission recommendation.
- Why it belongs: Second reading, Summary Offences Amendment (Decriminalisation of Public Drunkenness) Bill 2020, 2021; substantive record (7,713 characters), with a subject-specific machine brief.

### Reconciliation

- Speaker: K.J. Maher (not labelled in the resource)
- Date and parliament: 2022-06-01; South Australia
- Brief: There is no unified view on whether a Voice to Parliament should precede treaty and truth-telling, as some Uluru dialogues propose, or proceed simultaneously as in Victoria. The government will continue consulting on the sequencing.
- Why it belongs: Reconciliation, South Australia, 2022; substantive record (1,859 characters), with a subject-specific machine brief.

### First Nations Voice Bill

- Speaker: N.F. Cook (not labelled in the resource)
- Date and parliament: 2023-03-07; South Australia
- Brief: The speaker argued that parliament should pass the First Nations Voice Bill 2023, calling it a historic moment to deliver on the Uluru Statement from the Heart and address systemic disadvantage faced by Aboriginal people. They highlighted the Labor government's extensive consultation with Aboriginal communities, criticised the Liberal opposition's claims of a rushed process, and urged all members to support the bill.
- Why it belongs: First Nations Voice Bill, South Australia, 2023; substantive record (17,942 characters), with a subject-specific machine brief.

## Media Ownership (6)

### Broadcasting Services Amendment (Media Ownership) Bill 2006; Broadcasting Legislation Amendment (Digital Television) Bill 2006; Communications Legislation Amendment (Enforcement Powers) Bill 2006; Television Licence Fees Amendment Bill 2006

- Speaker: Lyn Allison (Australian Democrats)
- Date and parliament: 2006-10-11; Federal
- Brief: The government argued that media ownership reforms, including a two-out-of-three rule and local content mandates, are necessary to modernise outdated laws for the digital age and benefit consumers. Opponents countered that the changes would reduce media diversity, concentrate power, and harm regional communities.
- Why it belongs: Broadcasting Services Amendment (Media Ownership) Bill 2006; Broadcasting…, Federal, 2006; substantive record (148,516 characters), with a subject-specific machine brief.

### Evidence Amendment (Journalists’ Privilege) Bill 2007

- Speaker: Joe Ludwig (not labelled in the resource)
- Date and parliament: 2007-06-14; Federal
- Brief: The speaker argued the Evidence Amendment (Journalists' Privilege) Bill 2007 is a rushed political fix to pacify media interests and defuse the Harvey and McManus case before the election, not a genuine commitment to press freedom. The bill provides only a narrow, qualified privilege for journalists, excludes whistleblowers and other professionals, and requires courts to give greatest weight to national security, which the speaker said undermines its effectiveness.
- Why it belongs: Evidence Amendment (Journalists’ Privilege) Bill 2007, Federal, 2007; substantive record (61,511 characters), with a subject-specific machine brief.

### Public Broadcasting

- Speaker: Shaoquett Moselmane (not labelled in the resource)
- Date and parliament: 2018-06-21; NSW
- Brief: The speaker opposed any sale or privatisation of the ABC and SBS, praising their role in providing diverse, quality reporting and opportunities for young journalists, and criticised the Turnbull government for allegedly seeking to restrict the broadcasters.
- Why it belongs: Public Broadcasting, NSW, 2018; substantive record (4,237 characters), with a subject-specific machine brief.

### Regional media

- Speaker: Sheed (not labelled in the resource)
- Date and parliament: 2020-10-28; Victoria
- Brief: The speaker argued that regional media in Australia is in crisis due to closures, consolidations, and job losses, citing the loss of 138 newsrooms according to the Public Interest Journalism Initiative, and called for government support including advertising in local newspapers, a revamp of the Broadcasting Services Act, and lower thresholds for public interest journalism grants to preserve democratic accountability.
- Why it belongs: Regional media, Victoria, 2020; substantive record (13,399 characters), with a subject-specific machine brief.

### News Media Bargaining Code

- Speaker: Michelle Rowland (Labor)
- Date and parliament: 2021-02-17; Federal
- Brief: The speaker supported the mandatory bargaining code bill but criticised the government for delays and failing to implement broader ACCC recommendations, noting that around 200 newspapers have closed and hundreds of journalism jobs lost since 2017 media law changes.
- Why it belongs: News Media Bargaining Code, Federal, 2021; substantive record (24,644 characters), with a subject-specific machine brief.

### Freedom of speech

- Speaker: David Davis (not labelled in the resource)
- Date and parliament: 2024-11-12; Victoria
- Brief: The speaker argued that the Communications Legislation Amendment (Combatting Misinformation and Disinformation) Bill 2024 threatens freedom of speech in Victoria by giving overly broad powers to digital platforms such as Facebook, YouTube, and TikTok, and called on the Premier to intervene with the federal government to stop the bill.
- Why it belongs: Freedom of speech, Victoria, 2024; substantive record (2,599 characters), with a subject-specific machine brief.

