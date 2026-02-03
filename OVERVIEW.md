The phenomenon of code cloning and its impact on software development have been studied extensively in previous works and remains a topic of ongoing debate. Many of these studies reveal both the advantages and disadvantages of code cloning across different contexts. In general, developers often opt to copy and paste code instead of refactoring due to its simplicity and its short-term benefits. However, such code clones can increase complexity and maintenance efforts within the code base. To prevent long term issues, many studies find it advantageous to refactor, or restructure code. For example, a study found that across multiple environments, the development process may have been sped up with the use of copied code in the short term, but the chances of long term issues arising increased \cite{azeem:2020}. Some of the long term issues of code clones include: increased bug propagation, increased time spent on maintenance, and higher testing costs within code bases written in C\#, C, and Java \cite{mondal:2017}. Cloned code has been found to require more effort to maintain in over 60\% of the code bases studied, as compared to non-cloned code where only around 40\% of code bases experienced increased maintenance efforts. However, other studies explore environments where code cloning may be advantageous. For instance, an analysis of several large software systems was conducted to further understand the motivations, strengths, and limitations of different patterns of cloning \cite{4023973}. Some instances where duplication was perhaps the best option included: hardware and platform variations, gradual development and experimental variation, API/Library protocols, and programming idioms\footnote{Common or standard ways of writing particular functionalities}. Advantages for code duplication were: increased productivity in regards to developmental progress, reduced effort, and in some scenarios, increased stability. Disadvantages were: increased need for testing, confusion caused by insufficient documentation and linking, possible perpetuation of buggy code, and increased difficulty in identifying and fixing bugs system-wide.

In addition to the study of impacts of code clones within industry and software environments, prior work has also been done in computational notebook environments such as JupyterLab. For instance, an analysis of a large dataset of 2.7 million notebooks was conducted to determine the frequency at which different types of code are cloned \cite{källén:2020}. It was found that around 80\% of code snippets within the data set were approximate clones and that code clones across different repositories were more common than clones among the same repository. Similarly, another key work conducted two different studies \cite{koenzen:2017}. The first was a large-scale study of 1.25 million notebooks found within GitHub repositories to determine how often code duplication occurs. On average, 7.6\% of the code in GitHub repositories was duplicated. In the second study, the authors examined how 8 different university students reused code when completing various data science programming tasks. They found that the most common method of reuse among participants was reusing code from online sources and that snippets of code for data visualization were the most frequent clones. The studies provide insight into the frequency of code duplication in Jupyter Notebooks as well as the different types of code clones that were commonly found.

In response to the major prevalence of code cloning within Jupyter Notebooks \cite{koenzen:2017, källén:2020}, we have selected Jupyter Notebooks as the domain for our tool. In addition, through our literature review, we observed that notebooks are widely adopted among scientific researchers for tasks such as data analysis, visualization, and simulation. Likewise, a notable portion of code clones in this context are the result of common functions and library-specific idioms used for data visualization. Often the goal of scientific computational notebook code is to explore data, rather than create software for long-term use. As such, a substantial amount of cloned code may be better kept as copy-paste instances instead of being refactored. Refactoring such code could introduce excessive time costs and hinder data exploration critical to scientific research. Therefore, as opposed to discouraging the creation of code clones, our approach aims to help developers track and maintain code clones more effectively within Jupyter Notebooks.
  
%   existing tools
Numerous extensions have been created to help developers address and manage similar code more effectively in Jupyter Notebooks. An example is Elyra, a collection of extensions developed for Jupyter Notebooks \cite{elyra:2020}. One of the extensions in Elyra is a code snippet editor aimed towards ``making programming in JupyterLab more efficient by reducing repetitive work" \cite{elyradoc:2023}.

While Elyra has proven to be a valuable tool that enhances and facilitates developmental workflows in Jupyter Notebooks, it contains several limitations, particularly in the context of code clones. Currently, Elyra only supports manually created code snippets with no capacity for variations among instances. So while users can store and modify commonly used snippets for reuse, users must adjust and edit each snippet when applied in different contexts, which can ultimately become time consuming and repetitive.

% how we will expand on Elyra to address these limitations
We aim to leverage the convenience of code duplication while reducing its adverse effects. We propose a JupyterLab extension that extends copy-and-paste operations and helps users maintain resultant clones.

\section{Design Motivations}
Based on our literature review, we found the need for a new, alternative option for code reuse within computational notebooks. We selected JupyterLab as the platform for our system, as it is commonly used within the scientific research community. We designed Aspen to balance the ease of use of copy-paste with the organizational and synchronization capabilities of functions.

\subsection{Ease of use}
Functions are rarely defined by users within computational notebooks. The difficulty of abstraction and the priority of speedy analysis over clean code are contributing factors. Our design allows for users to save templates quickly, by simply highlighting the code and performing two clicks. Templates can then be reused with a simple drag-and-drop or a copy and paste. The goal was to make this process as streamlined as possible in order to be a close match to copy-paste behavior and a much easier option than defining functions.

\subsection{Flexibility and customization}
Functions offer limited flexibility: any variation between function calls must be encapsulated within parameters. Templates allow for a large amount of variance between instances. This is intended to allow for easy customization of items such as function arguments, file and variable names, comments, print statements, and more.

\subsection{Visual Highlights}
We designed Aspen's highlighting system to draw attention to the parts of the reused code that contain variation. The sections of differences, or deltas, are highlighted in both the templates and their instances. This is designed to assist users in easily identifying which sections of code are currently different, or in other words acting as parameters. If a user wishes to later create a function based on a template, this feature would make it visually clear what parts should be parametrized.

\subsection{Synchronization}
We designed two types of synchronization functionality. The first is the visual highlights described above. When edits are made to template instances, visual highlights appear across all instances of the template, as well as the template itself. The second is the propagation effect of templates. If a template is edited, all of its template instances will be synced to reflect the changes. These two functionalities ensure that templates and their instances always remain in sync.

\section{Architecture}
%We describe a scenario to illustrate the process of using Aspen. Consider an analyst who is looking to create visualizations for the data they have collected. This section outlines how Aspen can assist with creating a number of plots that require some customization.
We describe the various components and behaviors of Aspen.

\begin{subsection}
    {Templates}
      A user will be able to highlight then click to save certain code snippets within their notebooks as templates. The user will then be prompted to name the template for easy identification and future use. \textbf{Templates} serve as reusable building blocks that can be quickly accessed from the side library component within JupyterLab.
\end{subsection}

\begin{subsection}
    {Snippet Instances}
    Templates can be dragged from the library into notebooks or copy-pasted to create snippet instances. 
Each instance is linked to its corresponding template, enabling synchronized management. 
This linkage allows users to propagate updates across all instances of a snippet when one of them changes. 
Snippet instances behave like normal notebook code but retain awareness of their origin, 
supporting both reuse and controlled variation across multiple notebooks.
\end{subsection}

\begin{subsection}{Textboxes}
Textboxes are a central mechanism for managing variation across snippet instances. They function as both 
customizable parameters and visual indicators for differences between linked instances. A textbox can arise 
whenever divergence is detected across instances of a given template, enabling users to get a visual tracing of the differences without.

\textbf{Visualizing Deltas.} When linked instances diverge, Aspen automatically inserts textboxes into the 
associated template to highlight the regions of difference. This makes variation explicit and allows 
researchers to see exactly where code has changed across instances.

\textbf{Customizable Parameters.} Textboxes can be edited within templates and they will not propagate down to instances. The aim here is for the user to add customizable parameters so that on future usage of the template, the parameter within the textbox gets automatically inserted.

\subsubsection*{Synchronizaton Management}
\begin{itemize}
  \item \textbf{Automatic Creation:} Textboxes appear automatically when differences arise between instances at a specific location in the template.  
  \item \textbf{Persistence:} Intentional variations can be preserved as permanent textboxes, turning them into parameters for future instances.  
  \item \textbf{Disappearance:} A textbox can be removed by editing its value in the template and propagating that value downward to all instances, thereby unifying the content. A user will have the choice to choose between removing the textbox and universally syncing it or editing it as is and keeping the textbox there but with a universal parameter inserted.
  \item \textbf{Editing in Instances:} Changes made inside a textbox within an instance remain local and do not propagate back to the template, enabling controlled customization without breaking synchronization.  
  \item \textbf{Unintended Divergence:} If an instance drifts too far from its template, users can explicitly un-sync it, severing the link.  
  \item \textbf{Universal Syncing:} If a diverged instance should become the new standard, users can propagate its contents upward to overwrite the template and all linked instances, thereby removing all textboxes.  
\end{itemize}
\end{subsection}

\section{Evaluation}
We designed an IRB-approved, in-lab usability study to explore how participants would utilize Aspen's features. We also wanted to see how participants would decide between templates and other methods of reuse, such as regular copy-paste and creating functions. This study has not yet been conducted, but we plan to do so after the conclusion of the UR2PhD program.
\subsection{Methods}
The study was designed to answer these research questions:

\textit{RQ1. How do participants reuse code in data-oriented tasks?}
Participants may use templates, copy-paste, or defined functions to reuse code. Which do they choose, and why? If participants create templates, how do they interact with them? We will look at how many templates they create, how much they use them, and how they edit templates and/or instances. We are also interested to see if they rename or delete any templates.

\textit{RQ2. What are the benefits of Aspen compared to other methods of code reuse?}
We want to compare each of the options in terms of how much effort is spent initially as well as throughout the reuse process. Does Aspen aid in the customization and maintenance of copies?

\textit{RQ3. What kinds of tasks is Aspen not appropriate for?}
Can participants judge when Aspen is not well-suited to a task? Do participants try to use templates, then abandon them in favor of a different solution, and at what point?

\textit{RQ4. What is the effect of using templates on code organization and quality?}
We will analyze participants' final code in terms of mess. A few things we will look for include unused templates, naming conventions, cell execution order, and overall organization.

\textit{RQ5. What are the barriers to using Aspen?}
Are there any mental or technical reasons that prevent participants from using templates?

We plan to recruit graduate computer science students, researchers in scientific fields, and undergraduate students with data science experience. Participants will be required to have experience with Jupyter Notebooks.