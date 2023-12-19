import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
	DropdownComponent,
	ButtonComponent,
	TextComponent,
	TextAreaComponent,
	TFile,
} from "obsidian";
import { debounce } from "lodash";
import { domain, productName, clientId } from "./config";

const client_id = clientId;
const callbackUrl = `https://${domain}/integrations/oauth/obsidian`;

const sort = {
	sortOrder: (a: { sortOrder: number }, b: { sortOrder: number }) =>
		a.sortOrder - b.sortOrder,
};

type Project = {
	id: string;
	name: string;
	sortOrder: number;
	closed: boolean;
};

type Task = {
	id: string;
	title: string;
	content: string;
	priority: number;
	//  0 | 1 | 3 | 5
	isAllDay: boolean;
	startDate: string;
	dueDate: string;
	projectId: string;
	status: number;
	sortOrder: number;
	parentId?: string;
	columnId?: string;
};

type Column = {
	id: string;
	name: string;
	sortOrder: number;
};

interface TickTickPluginSettings {
	token: string;
	projects: Project[];
	avatarUrl: "";
	name: "";
	autoFetchData: boolean;
	login: boolean;
}

const DEFAULT_SETTINGS: TickTickPluginSettings = {
	token: "",
	projects: [],
	avatarUrl: "",
	name: "",
	autoFetchData: true,
	login: false,
};

export default class TickTickPlugin extends Plugin {
	settings: TickTickPluginSettings;
	private taskMap = new Map<string, { id: string, projectId: string }>();
	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "create-task",
			name: "New task",
			callback: () => {
				if (this.checkUserLoginStatus()) {
					const title = (() => {
						const activeFile =
							this.app.workspace.activeEditor?.file;
						const sel =
							this.app.workspace.activeEditor?.editor?.getSelection();
						if (activeFile) {
							return `[${
								sel || activeFile.name
							}](${this.getFileLink(activeFile)})`;
						}
						return "";
					})();
					new CreateTaskModal(this.app, this, { title }).open();
				}
			},
		});

		this.addCommand({
			id: "fetch-data",
			name: "Fetch user data",
			callback: async () => {
				if (this.checkUserLoginStatus()) {
					try {
						await this.fetchUserData();
						new Notice("Data fetched successfully");
					} catch (error) {
						new Notice("Data fetched failed");
					}
				}
			},
		});


		this.addCommand({
			id: "complete-task",
			name: "Complete task",
			callback: async () => {
				if (this.checkUserLoginStatus()) {
					const activeFile =
						this.app.workspace.activeEditor?.file;
					const sel =
						this.app.workspace.activeEditor?.editor?.getSelection();
					if (activeFile) {
						const title = `[${
							sel || activeFile.name
						}](${this.getFileLink(activeFile)})`;
						const taskInfo = this.taskMap.get(title);
						if(taskInfo) {
							const { id, projectId } = taskInfo;
							this.completeTask(id, projectId);
							this.taskMap.delete(title);
						} else {
							new Notice("Not a valid task: task dont exist");
						}
					}
				}
			},
		});


		this.addSettingTab(new SettingTab(this.app, this));

		this.registerAutoDataFetch();
	}

	onunload() {}

	registerAutoDataFetch = () => {
		if (this.settings.autoFetchData) {
			this.registerInterval(
				window.setInterval(() => {
					this.fetchUserData();
				}, 5 * 60 * 1000)
			);
		} else {
			this.fetchUserData();
		}
	};

	getFileLink = (file: TFile) => {
		return `obsidian://open?vault=${encodeURIComponent(
			file.vault.getName()
		)}&file=${encodeURIComponent(file.name)}`;
	};

	checkUserLoginStatus = () => {
		const isLogin = this.settings.login;
		if (!isLogin) {
			new Notice(
				`${productName} is not logged in, please check the token in settings.`
			);
		}
		return isLogin;
	};

	login = async (token: string) => {
		this.settings.login = true;
		this.settings.token = token;
		await this.saveSettings();
		await this.fetchUserData();
	};

	logout = async () => {
		this.settings.login = false;
		this.settings.projects = [];
		this.settings.avatarUrl = "";
		this.settings.name = "";
		await this.saveSettings();
	};

	fetchProjects = async () => {
		try {
			const data = await this.requestGET("/open/v1/project");
			if (data) {
				const { json } = data;
				if (Array.isArray(json)) {
					this.settings.projects = json;
					this.saveSettings();
				}
			}
			return new Promise((resolve, reject) => resolve("ok"));
		} catch (error) {
			return new Promise((resolve, reject) => reject(error));
		}
	};

	fetchUserInfo = async () => {
		try {
			const data = await this.requestGET("/open/v1/user/info");
			if (data) {
				const { json } = data;
				this.settings.avatarUrl = json.avatarUrl;
				this.settings.name = json.name;
				this.saveSettings();
			}
			return new Promise((resolve, reject) => resolve("ok"));
		} catch (error) {
			return new Promise((resolve, reject) => reject(error));
		}
	};

	createTask = async (taskData: Partial<Task>) => {
		try {
			const data = await this.requestPOST("/open/v1/task", taskData);
			if (data) {
				const responseData = JSON.parse(data.text);
				const { id, projectId, title } = responseData;
				this.taskMap.set(title, { id, projectId });
				console.log("Task ID:", id);
				console.log("Project ID:", projectId);
				new Notice(`Add ${taskData.title}`);
			}
		} catch (error) {
			new Notice("Add Failed");
			return new Promise((resolve, reject) => reject(error));
		}
	};


	completeTask = async (id: string, projectId: string) => {
		try {
			const data = await this.requestPOST(`/open/v1/project/${projectId}/task/${id}/complete`, {});
			if (data) {
				new Notice("complete done");
			}
		} catch (error) {
			new Notice("complete Failed");
			return new Promise((resolve, reject) => reject(error));
		}
	};


	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		this.fetchUserData();
	}

	fetchUserData = async () => {
		if (this.settings.token) {
			return Promise.all([this.fetchUserInfo(), this.fetchProjects()]);
		}
		return new Promise((resolve, reject) => resolve("ok"));
	};

	async saveSettings() {
		await this.saveData(this.settings);
	}

	requestGET = (url: string) => {
		return requestUrl({
			method: "GET",
			url: `https://api.${domain}${url}`,
			headers: {
				Authorization: `Bearer ${this.settings.token}`,
			},
		}).catch((e) => {
			switch (e.status) {
				case 401: {
					new Notice(
						`Your ${productName} login credentials have expired. Please login again.`
					);
					this.logout();
					break;
				}
				default:
					console.error(e);
					throw new Error(e);
			}
		});
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	requestPOST = (url: string, body: Record<string, any>) => {
		return requestUrl({
			method: "POST",
			url: `https://api.${domain}${url}`,
			headers: {
				Authorization: `Bearer ${this.settings.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}).catch((e) => {
			switch (e.status) {
				case 401: {
					new Notice(
						`Your ${productName} login credentials have expired. Please check the token in settings.`
					);
					this.logout();
					break;
				}
				default:
					console.error(e);
					throw new Error(e);
			}
		});
	};
}

class CreateTaskModal extends Modal {
	plugin: TickTickPlugin;

	taskData: {
		title: Task["title"];
		content: Task["content"];
		priority: Task["priority"];
		projectId: Task["projectId"];
		isAllDay: Task["isAllDay"];
		startDate: Task["startDate"];
		dueDate: Task["dueDate"];
	};

	constructor(app: App, plugin: TickTickPlugin, taskData: Partial<Task>) {
		super(app);
		this.plugin = plugin;
		const { title, content, priority, projectId, isAllDay, startDate, dueDate } = taskData;
		this.taskData = {
			title: title || "",
			content: content || "",
			priority: priority == null ? 0 : priority,
			projectId: projectId || "inbox",
			isAllDay: true,
			startDate: startDate || "Today",
			dueDate: dueDate || "",
		};
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText("New Task");

		// title
		const titleComp = new TextComponent(
			contentEl.createDiv({ cls: "modal-line" })
		)
			.setPlaceholder("Title")
			.setValue(this.taskData.title)
			.onChange((value) => {
				this.taskData.title = value;
			});
		titleComp.inputEl.style.flex = "auto";

		// content
		const contentComp = new TextAreaComponent(
			contentEl.createDiv({ cls: "modal-line" })
		)
			.setPlaceholder("Content")
			.setValue(this.taskData.content)
			.onChange((value) => {
				this.taskData.content = value;
			});
		contentComp.inputEl.style.flex = "auto";

		// list
		const projectLine = contentEl.createDiv({ cls: "modal-line" });
		projectLine.createEl("div", { cls: "label", text: "List" });
		const projectComp = new DropdownComponent(projectLine)
			.addOptions(
				this.plugin.settings.projects
					.filter((project) => !project.closed)
					.sort(sort.sortOrder)
					.reduce(
						(id2Name: Record<string, string>, project) => {
							id2Name[project.id] = project.name;
							return id2Name;
						},
						{ inbox: "Inbox" }
					)
			)
			.setValue(this.taskData.projectId)
			.onChange((value) => {
				this.taskData.projectId = value;
			});
		projectComp.selectEl.style.flex = "auto";

		const handleStartDateChange = (value: string) => {
			if (value === 'None') {	//Inbox
				this.taskData.startDate = "";
			} else if (value === 'Today') {	//set startDate to now
				const currentISODate = new Date().toISOString();
				this.taskData.startDate = currentISODate.replace("Z", "+0000");
			} else if (value === 'Tomorrow') {	//set startDate to tomorrow
				const today = new Date();
				const tomorrow = new Date(Date());
				tomorrow.setDate(today.getDate() + 1);
				const tomorrowISODate = tomorrow.toISOString();
				this.taskData.startDate = tomorrowISODate.replace("Z", "+0000");
			}
		};

		// startDateLine
		const startDateLine = contentEl.createDiv({ cls: "modal-line" });
		startDateLine.createEl("div", { cls: "label", text: "startDate" });
		const startDateComp = new DropdownComponent(startDateLine)
			.addOptions({
				"Inbox": "None",
				"Today": "Today",
				"Tomorrow": "Tomorrow",
			})
			.setValue(this.taskData.startDate.toString())
			.onChange((value) => {
				handleStartDateChange(value);
			});
			startDateComp.selectEl.style.flex = "auto";
			handleStartDateChange(startDateComp.getValue());	// manually trigger it at first

		// priority
		const priorityLine = contentEl.createDiv({ cls: "modal-line" });
		priorityLine.createEl("div", { cls: "label", text: "Priority" });
		const priorityComp = new DropdownComponent(priorityLine)
			.addOptions({
				0: "None",
				1: "Low",
				3: "Medium",
				5: "High",
			})
			.setValue(this.taskData.priority.toString())
			.onChange((value) => {
				this.taskData.priority = +value;
			});
		priorityComp.selectEl.style.flex = "auto";

		// submit
		const submitComp = new ButtonComponent(contentEl)
			.setButtonText("Create")
			.setCta()
			.onClick(() => {
				if (this.taskData.title) {
					this.plugin.createTask(this.taskData);
					this.close();
				} else {
					new Notice("Task title can't be empty");
				}
			});
		submitComp.buttonEl.style.float = "right";
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SettingTab extends PluginSettingTab {
	plugin: TickTickPlugin;

	constructor(app: App, plugin: TickTickPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	debounceTokenValidation = debounce(async (token: string) => {
		await this.plugin.login(token);
		this.display();
	}, 500);

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const url = `https://${domain}/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(
			callbackUrl
		)}&response_type=code&scope=tasks:read tasks:write`;

		const tokenDesc = document.createDocumentFragment();
		tokenDesc.textContent = `This Plugin need your ${productName} token to fetch the API, you can the token `;
		const tokenLink = containerEl.createEl("a");
		tokenLink.textContent = "here";
		tokenLink.href = url;
		tokenDesc.appendChild(tokenLink);
		new Setting(containerEl)
			.setName("API Token")
			.setDesc(tokenDesc)
			.addText((text) =>
				text.setValue(this.plugin.settings.token).onChange((token) => {
					this.debounceTokenValidation(token);
				})
			);

		new Setting(containerEl)
			.setName("Fetch data background")
			.setDesc(
				"Automatically fetches your project data in the background to ensure you have the latest data when creating a task"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFetchData)
					.onChange(async (value) => {
						this.plugin.settings.autoFetchData = value;
						await this.plugin.saveSettings();
						new Notice(
							"Please restart Obsidian to let settings effect"
						);
					})
			);

		// new Setting(containerEl)
		// 	.setName("Clear Local Data")
		// 	.addButton((button) =>
		// 		button.setButtonText("Clear").onClick(() => {
		// 			this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
		// 			this.plugin.saveSettings();
		// 			this.display();
		// 		})
		// 	);
	}
}
