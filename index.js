// ==UserScript==
// @name         B站视频自定义倍速
// @namespace    https://tampermonkey.net/
// @version      1.0
// @description  为B站视频添加自定义倍速功能，支持预设档位和手动输入（0.1x-16.0x）
// @author       xjuzhi
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/live/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------- 1. 可自定义配置（按需修改） --------------------------
    const CONFIG = {
        defaultSpeed: 1.0,          // 初始默认倍速
        rememberLastSpeed: true,    // 记忆当前视频上次倍速
        minSpeed: 0.25,             // 最低支持倍速
        maxSpeed: 16,               // 最高支持倍速
        stepSize: 0.25,             // 步进调整幅度（±0.25x）
        commonSpeeds: [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 8.0, 16.0], // 悬浮菜单显示的常用倍速
        floatBtn: {
            position: { top: '20px', right: '15px' }, // 相对于播放器的位置
            zIndex: 99999,          // 层级（确保在播放器控件之上）
            mainBtnStyle: 'rgba(0,0,0,0.75)', // 主按钮背景色
            menuStyle: 'rgba(0,0,0,0.85)'     // 菜单背景色
        },
        playerCoreClass: 'bpx-player-primary-area' // 播放器核心容器（稳定挂载用）
    };

    // -------------------------- 2. 全局变量 --------------------------
    let videoEl = null;         // 视频元素
    let playerCore = null;      // 播放器核心容器（bpx-player-primary-area）
    let floatMenu = null;       // 悬浮控制器整体
    let currentSpeed = CONFIG.defaultSpeed; // 当前生效倍速

    // -------------------------- 3. 核心工具函数 --------------------------
    /**
     * 查找播放器核心元素（基于核心容器，适配更稳定）
     */
    function findPlayerElements() {
        // 1. 先找播放器核心容器
        playerCore = document.querySelector(`.${CONFIG.playerCoreClass}`);
        if (!playerCore) {
            console.warn(`⚠️ 未找到播放器核心容器，尝试兼容查找`);
            // 兼容降级：直接找视频元素（避免容器类名变动）
            return { video: document.querySelector('.bpx-player-video-element'), core: null };
        }

        // 2. 在核心容器内找视频元素（精准无干扰）
        const video = playerCore.querySelector('video') || playerCore.querySelector('.bpx-player-video-element');
        return { video, core: playerCore };
    }

    /**
     * 验证倍速合法性（确保在0.25-16x范围）
     * @param {number} speed 目标倍速
     * @returns {number} 有效倍速
     */
    function getValidSpeed(speed) {
        const parsed = parseFloat(speed);
        return isNaN(parsed) ? CONFIG.defaultSpeed : Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, parsed));
    }

    /**
     * 同步B站原生倍速按钮显示（视觉一致）
     */
    function syncNativeSpeedDisplay() {
        const nativeSpeedBtn = document.querySelector('.bpx-player-ctrl-speed-name');
        if (nativeSpeedBtn) nativeSpeedBtn.textContent = `${currentSpeed}x`;
    }

    /**
     * 保存倍速到本地（记忆功能）
     */
    function saveSpeedToLocal() {
        if (!CONFIG.rememberLastSpeed) return;
        const videoId = window.location.pathname.match(/BV[0-9A-Za-z]{10,}/)?.[0] || 'unknown';
        localStorage.setItem(`bili_float_speed_${videoId}`, currentSpeed);
    }

    /**
     * 从本地加载记忆的倍速
     */
    function loadSavedSpeed() {
        if (!CONFIG.rememberLastSpeed) return CONFIG.defaultSpeed;
        const videoId = window.location.pathname.match(/BV[0-9A-Za-z]{10,}/)?.[0] || 'unknown';
        const saved = localStorage.getItem(`bili_float_speed_${videoId}`);
        return saved ? getValidSpeed(saved) : CONFIG.defaultSpeed;
    }

    // -------------------------- 4. 倍速控制逻辑 --------------------------
    /**
     * 设置视频倍速（核心功能）
     * @param {number} targetSpeed 目标倍速
     */
    function setVideoSpeed(targetSpeed) {
        if (!videoEl) return;
        // 1. 验证并应用倍速
        currentSpeed = getValidSpeed(targetSpeed);
        videoEl.playbackRate = currentSpeed;

        // 2. 同步显示（原生按钮 + 悬浮按钮）
        syncNativeSpeedDisplay();
        if (floatMenu) {
            floatMenu.querySelector('.float-speed-main').textContent = `${currentSpeed}x`;
        }

        // 3. 保存记忆
        saveSpeedToLocal();
        console.log(`✅ 倍速已设置：${currentSpeed}x`);
    }

    /**
     * 步进增加倍速（+stepSize）
     */
    function increaseSpeed() {
        setVideoSpeed(currentSpeed + CONFIG.stepSize);
    }

    /**
     * 步进减少倍速（-stepSize）
     */
    function decreaseSpeed() {
        setVideoSpeed(currentSpeed - CONFIG.stepSize);
    }

    // -------------------------- 5. 构建悬浮按钮UI --------------------------
    /**
     * 创建悬浮倍速控制器（挂载到播放器核心容器）
     */
    function createFloatController() {
        if (!playerCore) return;

        // 1. 悬浮控制器主容器
        floatMenu = document.createElement('div');
        floatMenu.className = 'bili-float-speed-menu';
        floatMenu.style.cssText = `
            position: absolute;
            top: ${CONFIG.floatBtn.position.top};
            right: ${CONFIG.floatBtn.position.right};
            z-index: ${CONFIG.floatBtn.zIndex};
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-family: "Microsoft YaHei", Arial, sans-serif;
        `;

        // 2. 主按钮（显示当前倍速，点击展开/收起菜单）
        const mainBtn = document.createElement('button');
        mainBtn.className = 'float-speed-main';
        mainBtn.textContent = `${currentSpeed}x`;
        mainBtn.style.cssText = `
            padding: 7px 14px;
            border: none;
            border-radius: 25px;
            background: ${CONFIG.floatBtn.mainBtnStyle};
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        `;
        mainBtn.onmouseover = () => mainBtn.style.background = CONFIG.floatBtn.mainBtnStyle.replace('0.75', '0.9');
        mainBtn.onmouseout = () => mainBtn.style.background = CONFIG.floatBtn.mainBtnStyle;

        // 3. 菜单容器（默认隐藏）
        const menuContainer = document.createElement('div');
        menuContainer.className = 'float-speed-menu-container';
        menuContainer.style.cssText = `
            display: none;
            flex-direction: column;
            gap: 5px;
            padding: 10px;
            border-radius: 10px;
            background: ${CONFIG.floatBtn.menuStyle};
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        `;

        // 4. 常用倍速按钮组
        CONFIG.commonSpeeds.forEach(speed => {
            const speedBtn = document.createElement('button');
            speedBtn.textContent = `${speed}x`;
            speedBtn.style.cssText = `
                padding: 5px 10px;
                border: none;
                border-radius: 6px;
                background: transparent;
                color: #fff;
                font-size: 13px;
                text-align: left;
                cursor: pointer;
                transition: background 0.2s;
            `;
            speedBtn.onmouseover = () => speedBtn.style.background = 'rgba(255,255,255,0.2)';
            speedBtn.onmouseout = () => speedBtn.style.background = 'transparent';
            speedBtn.onclick = (e) => {
                e.stopPropagation(); // 防止菜单收起
                setVideoSpeed(speed);
            };
            menuContainer.appendChild(speedBtn);
        });

        // 5. 步进调整按钮（+/-）
        const stepGroup = document.createElement('div');
        stepGroup.style.cssText = `
            display: flex;
            gap: 6px;
            margin: 5px 0;
            padding: 5px 0;
            border-top: 1px solid rgba(255,255,255,0.1);
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        const minusBtn = document.createElement('button');
        minusBtn.textContent = `- ${CONFIG.stepSize}x`;
        const plusBtn = document.createElement('button');
        plusBtn.textContent = `+ ${CONFIG.stepSize}x`;
        [minusBtn, plusBtn].forEach(btn => {
            btn.style.cssText = `
                flex: 1;
                padding: 5px;
                border: none;
                border-radius: 6px;
                background: rgba(255,255,255,0.1);
                color: #fff;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.2s;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.2)';
            btn.onmouseout = () => btn.style.background = 'rgba(255,255,255,0.1)';
        });
        minusBtn.onclick = (e) => {
            e.stopPropagation();
            decreaseSpeed();
        };
        plusBtn.onclick = (e) => {
            e.stopPropagation();
            increaseSpeed();
        };
        stepGroup.appendChild(minusBtn);
        stepGroup.appendChild(plusBtn);
        menuContainer.appendChild(stepGroup);

        // 6. 自定义倍速输入框
        const customGroup = document.createElement('div');
        customGroup.style.cssText = `
            display: flex;
            gap: 6px;
            margin-top: 5px;
        `;
        const customInput = document.createElement('input');
        customInput.type = 'number';
        customInput.placeholder = '自定义倍速';
        customInput.min = CONFIG.minSpeed;
        customInput.max = CONFIG.maxSpeed;
        customInput.step = CONFIG.stepSize;
        customInput.style.cssText = `
            flex: 1;
            padding: 5px 8px;
            border: none;
            border-radius: 6px;
            background: rgba(255,255,255,0.1);
            color: #fff;
            font-size: 13px;
            outline: none;
        `;
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认';
        confirmBtn.style.cssText = `
            padding: 5px 12px;
            border: none;
            border-radius: 6px;
            background: #fb7299; // B站粉色适配
            color: #fff;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
        `;
        confirmBtn.onmouseover = () => confirmBtn.style.background = '#f85187';
        confirmBtn.onmouseout = () => confirmBtn.style.background = '#fb7299';
        // 确认自定义倍速
        confirmBtn.onclick = (e) => {
            e.stopPropagation();
            setVideoSpeed(customInput.value);
            customInput.value = '';
        };
        // 回车确认
        customInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                setVideoSpeed(customInput.value);
                customInput.value = '';
            }
        };
        customGroup.appendChild(customInput);
        customGroup.appendChild(confirmBtn);
        menuContainer.appendChild(customGroup);

        // 7. 组装控制器
        floatMenu.appendChild(mainBtn);
        floatMenu.appendChild(menuContainer);

        // 8. 展开/收起逻辑
        mainBtn.onclick = () => {
            menuContainer.style.display = menuContainer.style.display === 'flex' ? 'none' : 'flex';
        };

        // 9. 点击页面其他区域收起菜单
        document.addEventListener('click', (e) => {
            if (floatMenu && !floatMenu.contains(e.target)) {
                menuContainer.style.display = 'none';
            }
        });

        // 10. 挂载到播放器核心容器（确保随播放器定位）
        playerCore.style.position = playerCore.style.position || 'relative';
        playerCore.appendChild(floatMenu);
    }

    // -------------------------- 6. 脚本初始化（确保元素加载完成） --------------------------
    function initScript() {
        // 定时器检查播放器元素（处理动态渲染）
        let checkCount = 0;
        const maxCheck = 20; // 最多检查10秒（20×500ms）
        const checkInterval = setInterval(() => {
            const { video, core } = findPlayerElements();
            if (video && core) {
                clearInterval(checkInterval);
                // 1. 赋值全局元素
                videoEl = video;
                playerCore = core;
                // 2. 加载记忆倍速
                currentSpeed = loadSavedSpeed();
                // 3. 创建悬浮控制器
                createFloatController();
                // 4. 初始化倍速
                setVideoSpeed(currentSpeed);
                // 5. 监听视频切换（选集/刷新后重新适配）
                const observer = new MutationObserver(() => {
                    const newVideo = findPlayerElements().video;
                    if (newVideo && newVideo !== videoEl) {
                        videoEl = newVideo;
                        currentSpeed = loadSavedSpeed();
                        setVideoSpeed(currentSpeed);
                    }
                });
                observer.observe(playerCore, { childList: true, subtree: true });
                console.log('🎉 B站悬浮倍速控制器已加载！');
            }

            // 超过最大检查次数，提示用户
            if (checkCount >= maxCheck) {
                clearInterval(checkInterval);
                console.error('⚠️ 悬浮倍速控制器初始化失败：未找到播放器元素，可能页面结构已更新');
            }
            checkCount++;
        }, 500);
    }

    // 启动脚本
    initScript();
})();
