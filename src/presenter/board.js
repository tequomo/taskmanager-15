import BoardView from '../view/board.js';
import SortView from '../view/sort.js';
import TaskListView from '../view/task-list.js';
import LoadingView from '../view/loading.js';
import NoTaskView from '../view/no-task.js';
import LoadMoreButtonView from '../view/load-more-button.js';
import TaskPresenter, {State as TaskPresenterViewState} from './task.js';
import TaskNewPresenter from './task-new.js';
import {render, RenderPosition, remove} from '../utils/render.js';
import {sortTaskUp, sortTaskDown} from '../utils/task.js';
import {filter} from '../utils/filter.js';
import {SortType, UpdateType, UserAction, FilterType} from '../const.js';

const TASK_COUNT_PER_STEP = 8;

export default class Board {
  constructor(boardContainer, tasksModel, filterModel, api) {
    this._tasksModel = tasksModel;
    this._filterModel = filterModel;
    this._boardContainer = boardContainer;
    this._renderedTaskCount = TASK_COUNT_PER_STEP;
    this._taskPresenter = new Map();
    this._filterType = FilterType.ALL;
    this._currentSortType = SortType.DEFAULT;
    this._isLoading = true;
    this._api = api;

    this._sortComponent = null;
    this._loadMoreButtonComponent = null;
    this._noTaskComponent = null;

    this._boardComponent = new BoardView();
    this._taskListComponent = new TaskListView();
    this._loadingComponent = new LoadingView();

    this._handleViewAction = this._handleViewAction.bind(this);
    this._handleModelEvent = this._handleModelEvent.bind(this);
    this._handleModeChange = this._handleModeChange.bind(this);
    this._handleLoadMoreButtonClick = this._handleLoadMoreButtonClick.bind(this);
    this._handleSortTypeChange = this._handleSortTypeChange.bind(this);

    this._taskNewPresenter = new TaskNewPresenter(this._taskListComponent, this._handleViewAction);
  }

  init() {
    render(this._boardContainer, this._boardComponent, RenderPosition.BEFOREEND);
    render(this._boardComponent, this._taskListComponent, RenderPosition.BEFOREEND);

    this._tasksModel.addObserver(this._handleModelEvent);
    this._filterModel.addObserver(this._handleModelEvent);

    this._renderBoard();
  }

  destroy() {
    this._clearBoard({resetRenderedTaskCount: true, resetSortType: true});

    remove(this._taskListComponent);
    remove(this._boardComponent);

    this._tasksModel.removeObserver(this._handleModelEvent);
    this._filterModel.removeObserver(this._handleModelEvent);
  }

  createTask(callback) {
    this._taskNewPresenter.init(callback);
  }

  _getTasks() {
    this._filterType = this._filterModel.getFilter();
    const tasks = this._tasksModel.getTasks();
    const filtredTasks = filter[this._filterType](tasks);

    switch (this._currentSortType) {
      case SortType.DATE_UP:
        return filtredTasks.sort(sortTaskUp);
      case SortType.DATE_DOWN:
        return filtredTasks.sort(sortTaskDown);
    }

    return filtredTasks;
  }

  _handleModeChange() {
    this._taskNewPresenter.destroy();
    this._taskPresenter.forEach((presenter) => presenter.resetView());
  }

  _handleViewAction(actionType, updateType, update) {
    switch (actionType) {
      case UserAction.UPDATE_TASK:
        this._taskPresenter.get(update.id).setViewState(TaskPresenterViewState.SAVING);
        this._api.updateTask(update)
          .then((response) => {
            this._tasksModel.updateTask(updateType, response);
          })
          .catch(() => {
            this._taskPresenter.get(update.id).setViewState(TaskPresenterViewState.ABORTING);
          });
        break;
      case UserAction.ADD_TASK:
        this._taskNewPresenter.setSaving();
        this._api.addTask(update)
          .then((response) => {
            this._tasksModel.addTask(updateType, response);
          })
          .catch(() => {
            this._taskNewPresenter.setAborting();
          });
        break;
      case UserAction.DELETE_TASK:
        this._taskPresenter.get(update.id).setViewState(TaskPresenterViewState.DELETING);
        this._api.deleteTask(update)
          .then(() => {
            // Обратите внимание, метод удаления задачи на сервере
            // ничего не возвращает. Это и верно,
            // ведь что можно вернуть при удалении задачи?
            // Поэтому в модель мы всё также передаем update
            this._tasksModel.deleteTask(updateType, update);
          })
          .catch(() => {
            this._taskPresenter.get(update.id).setViewState(TaskPresenterViewState.ABORTING);
          });
        break;
    }
  }

  _handleModelEvent(updateType, data) {
    switch (updateType) {
      case UpdateType.PATCH:
        this._taskPresenter.get(data.id).init(data);
        break;
      case UpdateType.MINOR:
        this._clearBoard();
        this._renderBoard();
        break;
      case UpdateType.MAJOR:
        this._clearBoard({resetRenderedTaskCount: true, resetSortType: true});
        this._renderBoard();
        break;
      case UpdateType.INIT:
        this._isLoading = false;
        remove(this._loadingComponent);
        this._renderBoard();
        break;
    }
  }

  _handleSortTypeChange(sortType) {
    if (this._currentSortType === sortType) {
      return;
    }

    this._currentSortType = sortType;
    this._clearBoard({resetRenderedTaskCount: true});
    this._renderBoard();
  }

  _renderSort() {
    if (this._sortComponent !== null) {
      this._sortComponent = null;
    }

    this._sortComponent = new SortView(this._currentSortType);
    this._sortComponent.setSortTypeChangeHandler(this._handleSortTypeChange);

    render(this._boardComponent, this._sortComponent, RenderPosition.AFTERBEGIN);
  }

  _renderTask(task) {
    const taskPresenter = new TaskPresenter(this._taskListComponent, this._handleViewAction, this._handleModeChange);
    taskPresenter.init(task);
    this._taskPresenter.set(task.id, taskPresenter);
  }

  _renderTasks(tasks) {
    tasks.forEach((task) => this._renderTask(task));
  }

  _renderLoading() {
    render(this._boardComponent, this._loadingComponent, RenderPosition.AFTERBEGIN);
  }

  _renderNoTasks() {
    this._noTaskComponent = new NoTaskView(this._filterType);
    render(this._boardComponent, this._noTaskComponent, RenderPosition.AFTERBEGIN);
  }

  _handleLoadMoreButtonClick() {
    const taskCount = this._getTasks().length;
    const newRenderedTaskCount = Math.min(taskCount, this._renderedTaskCount + TASK_COUNT_PER_STEP);
    const tasks = this._getTasks().slice(this._renderedTaskCount, newRenderedTaskCount);

    this._renderTasks(tasks);
    this._renderedTaskCount = newRenderedTaskCount;

    if (this._renderedTaskCount >= taskCount) {
      remove(this._loadMoreButtonComponent);
    }
  }

  _renderLoadMoreButton() {
    if (this._loadMoreButtonComponent !== null) {
      this._loadMoreButtonComponent = null;
    }

    this._loadMoreButtonComponent = new LoadMoreButtonView();
    this._loadMoreButtonComponent.setClickHandler(this._handleLoadMoreButtonClick);

    render(this._boardComponent, this._loadMoreButtonComponent, RenderPosition.BEFOREEND);
  }

  _clearBoard({resetRenderedTaskCount = false, resetSortType = false} = {}) {
    const taskCount = this._getTasks().length;

    this._taskNewPresenter.destroy();
    this._taskPresenter.forEach((presenter) => presenter.destroy());
    this._taskPresenter.clear();

    remove(this._sortComponent);
    remove(this._loadingComponent);
    remove(this._loadMoreButtonComponent);

    if (this._noTaskComponent) {
      remove(this._noTaskComponent);
    }

    if (resetRenderedTaskCount) {
      this._renderedTaskCount = TASK_COUNT_PER_STEP;
    } else {
      // На случай, если перерисовка доски вызвана
      // уменьшением количества задач (например, удаление или перенос в архив)
      // нужно скорректировать число показанных задач
      this._renderedTaskCount = Math.min(taskCount, this._renderedTaskCount);
    }

    if (resetSortType) {
      this._currentSortType = SortType.DEFAULT;
    }
  }

  _renderBoard() {
    if (this._isLoading) {
      this._renderLoading();
      return;
    }

    const tasks = this._getTasks();
    const taskCount = tasks.length;

    if (taskCount === 0) {
      this._renderNoTasks();
      return;
    }

    this._renderSort();

    // Теперь, когда _renderBoard рендерит доску не только на старте,
    // но и по ходу работы приложения, нужно заменить
    // константу TASK_COUNT_PER_STEP на свойство _renderedTaskCount,
    // чтобы в случае перерисовки сохранить N-показанных карточек
    this._renderTasks(tasks.slice(0, Math.min(taskCount, this._renderedTaskCount)));

    if (taskCount > this._renderedTaskCount) {
      this._renderLoadMoreButton();
    }
  }
}
