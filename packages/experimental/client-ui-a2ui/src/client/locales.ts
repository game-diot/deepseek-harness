/** Browser-only A2UI tool row copy. */

/** English copy. */
export const en = {
  title: 'A2UI interface',
  preparing: 'Preparing A2UI interface data…',
  running: 'Validating A2UI interface data…',
  ready: 'Interface data is ready.',
  loading: 'Loading A2UI interface…',
  renderFailed: 'The A2UI interface could not be rendered.',
  actionUnavailable: 'This action is not connected to the Agent yet.',
  invalid: 'This A2UI result cannot be rendered.',
  failed: 'The A2UI request failed.',
  confirmRequired: 'This action needs your confirmation before it is sent.',
  confirm: 'Confirm',
  cancel: 'Cancel',
}

/** Keys shared by every dictionary. */
export type A2uiClientKey = keyof typeof en

/** Chinese copy. */
export const zh: Record<A2uiClientKey, string> = {
  title: 'A2UI 界面', preparing: '正在准备 A2UI 界面数据…', running: '正在校验 A2UI 界面数据…',
  ready: '界面数据已就绪', loading: '正在加载 A2UI 界面…', renderFailed: 'A2UI 界面无法渲染',
  actionUnavailable: '该操作尚未连接到 Agent', invalid: '此 A2UI 结果无法渲染', failed: 'A2UI 请求失败',
  confirmRequired: '该操作需要你确认后才会发送。', confirm: '确认', cancel: '取消',
}

/** Japanese copy. */
export const ja: Record<A2uiClientKey, string> = {
  title: 'A2UI インターフェース', preparing: 'A2UI インターフェースデータを準備中…', running: 'A2UI インターフェースデータを検証中…',
  ready: 'インターフェースデータの準備ができました。', loading: 'A2UI インターフェースを読み込み中…', renderFailed: 'A2UI インターフェースをレンダリングできませんでした。', actionUnavailable: 'この操作はまだ Agent に接続されていません。', invalid: 'この A2UI 結果はレンダリングできません。', failed: 'A2UI リクエストに失敗しました。', confirmRequired: 'この操作は送信前に確認が必要です。', confirm: '確認', cancel: 'キャンセル',
}

/** Spanish copy. */
export const es: Record<A2uiClientKey, string> = {
  title: 'Interfaz A2UI', preparing: 'Preparando datos de la interfaz A2UI…', running: 'Validando datos de la interfaz A2UI…',
  ready: 'Los datos de la interfaz están listos.', loading: 'Cargando la interfaz A2UI…', renderFailed: 'No se pudo renderizar la interfaz A2UI.', actionUnavailable: 'Esta acción aún no está conectada al Agent.', invalid: 'Este resultado A2UI no se puede renderizar.', failed: 'La solicitud A2UI falló.', confirmRequired: 'Esta acción requiere tu confirmación antes de enviarse.', confirm: 'Confirmar', cancel: 'Cancelar',
}

/** French copy. */
export const fr: Record<A2uiClientKey, string> = {
  title: 'Interface A2UI', preparing: "Préparation des données de l'interface A2UI…", running: "Validation des données de l'interface A2UI…",
  ready: "Les données de l'interface sont prêtes.", loading: "Chargement de l'interface A2UI…", renderFailed: "L'interface A2UI n'a pas pu être rendue.", actionUnavailable: "Cette action n'est pas encore connectée à l'Agent.", invalid: 'Ce résultat A2UI ne peut pas être rendu.', failed: 'La requête A2UI a échoué.', confirmRequired: "Cette action nécessite votre confirmation avant l'envoi.", confirm: 'Confirmer', cancel: 'Annuler',
}

/** German copy. */
export const de: Record<A2uiClientKey, string> = {
  title: 'A2UI-Oberfläche', preparing: 'A2UI-Oberflächendaten werden vorbereitet…', running: 'A2UI-Oberflächendaten werden validiert…',
  ready: 'Die Oberflächendaten sind bereit.', loading: 'A2UI-Oberfläche wird geladen…', renderFailed: 'Die A2UI-Oberfläche konnte nicht dargestellt werden.', actionUnavailable: 'Diese Aktion ist noch nicht mit dem Agent verbunden.', invalid: 'Dieses A2UI-Ergebnis kann nicht dargestellt werden.', failed: 'Die A2UI-Anfrage ist fehlgeschlagen.', confirmRequired: 'Diese Aktion muss vor dem Senden bestätigt werden.', confirm: 'Bestätigen', cancel: 'Abbrechen',
}

/** Russian copy. */
export const ru: Record<A2uiClientKey, string> = {
  title: 'Интерфейс A2UI', preparing: 'Подготовка данных интерфейса A2UI…', running: 'Проверка данных интерфейса A2UI…',
  ready: 'Данные интерфейса готовы.', loading: 'Загрузка интерфейса A2UI…', renderFailed: 'Не удалось отобразить интерфейс A2UI.', actionUnavailable: 'Это действие ещё не подключено к Agent.', invalid: 'Этот результат A2UI невозможно отобразить.', failed: 'Запрос A2UI завершился ошибкой.', confirmRequired: 'Это действие нужно подтвердить перед отправкой.', confirm: 'Подтвердить', cancel: 'Отмена',
}

/** Portuguese copy. */
export const pt: Record<A2uiClientKey, string> = {
  title: 'Interface A2UI', preparing: 'Preparando dados da interface A2UI…', running: 'Validando dados da interface A2UI…',
  ready: 'Os dados da interface estão prontos.', loading: 'Carregando a interface A2UI…', renderFailed: 'Não foi possível renderizar a interface A2UI.', actionUnavailable: 'Esta ação ainda não está conectada ao Agent.', invalid: 'Este resultado A2UI não pode ser renderizado.', failed: 'A solicitação A2UI falhou.', confirmRequired: 'Esta ação precisa da sua confirmação antes de ser enviada.', confirm: 'Confirmar', cancel: 'Cancelar',
}

/** Locale namespace for this Client feature. */
export const NS = 'a2ui.client' as const
